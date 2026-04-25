import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

const mockMessagesCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockMessagesCreate },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Spy on updateEntry used by restoreVersion without affecting other tests too much.
const mockUpdateEntry = vi.fn()
vi.mock('@/app/api/knowledge/actions', async (orig) => {
  const actual = await (orig() as Promise<any>)
  return { ...actual, updateEntry: (...args: any[]) => mockUpdateEntry(...args) }
})

const MOCK_USER = { id: 'user-1', email: 'sonja@example.com' }
const MOCK_PROFILE = { org_id: 'org-1' }

type Resp = { data?: any; error?: any }

/**
 * Build a chainable query builder. `responses` lets you provide different
 * resolved values based on the "terminal" method called (then, single,
 * maybeSingle). By default all terminals resolve to `default`.
 */
function makeChain(responses: {
  default?: Resp
  single?: Resp
  maybeSingle?: Resp
  // capture inserts/updates for assertions
  onInsert?: (payload: any) => void
} = {}): any {
  const chain: any = {}
  const methods = ['select', 'eq', 'neq', 'in', 'order', 'limit', 'update', 'delete', 'or', 'gte']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.insert = vi.fn((payload: any) => { responses.onInsert?.(payload); return chain })
  const def: Resp = responses.default ?? { data: null, error: null }
  chain.single = vi.fn().mockResolvedValue(responses.single ?? def)
  chain.maybeSingle = vi.fn().mockResolvedValue(responses.maybeSingle ?? def)
  chain.then = (resolve: any, reject?: any) => Promise.resolve(def).then(resolve, reject)
  return chain
}

/**
 * Setup helper: map table -> either a single Resp (applied to all terminals)
 * or a structured object with per-terminal responses.
 */
function setupTables(tables: Record<string, Resp | {
  default?: Resp
  single?: Resp
  maybeSingle?: Resp
  onInsert?: (p: any) => void
}>) {
  mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
  mockFrom.mockImplementation((table: string) => {
    const cfg = tables[table]
    if (!cfg) return makeChain()
    // A plain Resp (has data or error keys only)
    if ('data' in cfg || 'error' in cfg) {
      return makeChain({ default: cfg as Resp, single: cfg as Resp, maybeSingle: cfg as Resp })
    }
    return makeChain(cfg as any)
  })
}

import {
  listVersions,
  restoreVersion,
  listRelated,
  critiqueAndSave,
  addFollowUpNote,
} from '@/app/api/knowledge/detail'

beforeEach(() => {
  vi.clearAllMocks()
  process.env.ANTHROPIC_API_KEY = 'test-key'
  mockMessagesCreate.mockResolvedValue({
    content: [{ type: 'text', text: '## Summary\nA critique' }],
  })
})

// ── listVersions ─────────────────────────────────────────────────────────────

describe('listVersions', () => {
  it('returns versions sorted by version desc', async () => {
    const rows = [
      { id: 'v2', entry_id: 'e1', version: 2, title: 'B' },
      { id: 'v1', entry_id: 'e1', version: 1, title: 'A' },
    ]
    setupTables({
      user_profiles: { default: { data: MOCK_PROFILE, error: null }, single: { data: MOCK_PROFILE, error: null } },
      knowledge_versions: { default: { data: rows, error: null } },
    })
    const out = await listVersions('e1')
    expect(out).toHaveLength(2)
    expect(mockFrom).toHaveBeenCalledWith('knowledge_versions')
  })

  it('throws on error', async () => {
    setupTables({
      user_profiles: { single: { data: MOCK_PROFILE, error: null } },
      knowledge_versions: { default: { data: null, error: { message: 'boom' } } },
    })
    await expect(listVersions('e1')).rejects.toThrow('Failed to list versions')
  })
})

// ── restoreVersion ───────────────────────────────────────────────────────────

describe('restoreVersion', () => {
  it('snapshots current state via updateEntry using the version payload', async () => {
    const versionRow = {
      id: 'v1', entry_id: 'e1', version: 3,
      title: 'Old title', body: 'Old body', kind: 'idea', entity: 'sf',
      tags: ['x'], type_hint: 'strategy', idea_status: 'raw',
    }
    setupTables({
      user_profiles: { single: { data: MOCK_PROFILE, error: null } },
      knowledge_versions: { maybeSingle: { data: versionRow, error: null } },
    })
    await restoreVersion('v1')
    expect(mockUpdateEntry).toHaveBeenCalledWith('e1', expect.objectContaining({
      title: 'Old title',
      body: 'Old body',
      kind: 'idea',
      entity: 'sf',
      tags: ['x'],
      type_hint: 'strategy',
      idea_status: 'raw',
    }))
  })

  it('throws when version not found', async () => {
    setupTables({
      user_profiles: { single: { data: MOCK_PROFILE, error: null } },
      knowledge_versions: { maybeSingle: { data: null, error: null } },
    })
    await expect(restoreVersion('nope')).rejects.toThrow('Version not found')
  })
})

// ── listRelated ──────────────────────────────────────────────────────────────

describe('listRelated', () => {
  it('returns mapped entries via FK-alias success path', async () => {
    const joined = [{
      id: 'l1', relation: 'critique_of', created_at: '2026-04-01',
      from_entry: 'ce1', to_entry: 'e1',
      knowledge_entries: { id: 'ce1', title: 'Critique' },
    }]
    setupTables({
      user_profiles: { single: { data: MOCK_PROFILE, error: null } },
      knowledge_links: { default: { data: joined, error: null } },
    })
    const out = await listRelated('e1', 'critique_of')
    expect(out).toHaveLength(1)
    expect(out[0].entry.id).toBe('ce1')
    expect(out[0].relation).toBe('critique_of')
  })

  it('uses two-step fallback when FK alias fails', async () => {
    // First call returns error (alias fails); then a plain links-only call;
    // then knowledge_entries fetch.
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    const linksRow = [{ id: 'l1', relation: 'critique_of', created_at: 'x', from_entry: 'ce1' }]
    const entriesRow = [{ id: 'ce1', title: 'Critique' }]
    let linksCall = 0
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      }
      if (table === 'knowledge_links') {
        linksCall++
        if (linksCall === 1) {
          return makeChain({ default: { data: null, error: { message: 'no alias' } } })
        }
        return makeChain({ default: { data: linksRow, error: null } })
      }
      if (table === 'knowledge_entries') {
        return makeChain({ default: { data: entriesRow, error: null } })
      }
      return makeChain()
    })
    const out = await listRelated('e1', 'critique_of')
    expect(out).toHaveLength(1)
    expect(out[0].entry.id).toBe('ce1')
    expect(out[0].relation).toBe('critique_of')
  })
})

// ── critiqueAndSave ──────────────────────────────────────────────────────────

describe('critiqueAndSave', () => {
  it('rejects vault entries', async () => {
    setupTables({
      user_profiles: { single: { data: MOCK_PROFILE, error: null } },
      knowledge_entries: { maybeSingle: { data: { id: 'e1', access: 'vault', entity: 'sf' }, error: null } },
    })
    await expect(critiqueAndSave('e1')).rejects.toThrow('Vault entries cannot be critiqued')
  })

  it('throws when ANTHROPIC_API_KEY missing', async () => {
    delete process.env.ANTHROPIC_API_KEY
    setupTables({ user_profiles: { single: { data: MOCK_PROFILE, error: null } } })
    await expect(critiqueAndSave('e1')).rejects.toThrow('ANTHROPIC_API_KEY not configured')
  })

  it('passes the critique prompt to Anthropic and persists kind=critique + critique_of link', async () => {
    let insertedPayload: any = null
    let linkPayload: any = null
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    const entry = { id: 'e1', title: 'T', body: 'Body', summary: null, kind: 'idea', entity: 'sf', access: 'standard', tags: ['a'] }
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_entries') {
        return makeChain({
          maybeSingle: { data: entry, error: null },
          default: { data: [], error: null }, // neighbors
          single: { data: { id: 'crit-1' }, error: null },
          onInsert: (p) => { insertedPayload = p },
        })
      }
      if (table === 'knowledge_links') {
        return makeChain({
          default: { data: null, error: null },
          onInsert: (p) => { linkPayload = p },
        })
      }
      return makeChain()
    })
    const res = await critiqueAndSave('e1')
    expect(res.id).toBe('crit-1')
    // Prompt passed to Anthropic
    const callArg = mockMessagesCreate.mock.calls[0][0]
    expect(callArg.messages[0].content).toContain('Critique the following entry')
    expect(callArg.messages[0].content).toContain('title: T')
    // Insert payload
    expect(insertedPayload).toMatchObject({ kind: 'critique', access: 'standard', entity: 'sf' })
    expect(insertedPayload.tags).toEqual(['critique'])
    // Link payload
    expect(linkPayload).toMatchObject({ from_entry: 'crit-1', to_entry: 'e1', relation: 'critique_of' })
  })

  it('THROWS if knowledge_links insert returns an error (regression: silent-failure bug)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    const entry = { id: 'e1', title: 'T', body: 'B', summary: null, kind: 'idea', entity: 'sf', access: 'standard', tags: [] }
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_entries') {
        return makeChain({
          maybeSingle: { data: entry, error: null },
          default: { data: [], error: null },
          single: { data: { id: 'crit-1' }, error: null },
        })
      }
      if (table === 'knowledge_links') {
        return makeChain({ default: { data: null, error: { message: 'link insert failed' } } })
      }
      return makeChain()
    })
    await expect(critiqueAndSave('e1')).rejects.toThrow('Critique saved but link failed')
  })
})

// ── addFollowUpNote ──────────────────────────────────────────────────────────

describe('addFollowUpNote', () => {
  it('requires non-empty body', async () => {
    setupTables({ user_profiles: { single: { data: MOCK_PROFILE, error: null } } })
    await expect(addFollowUpNote('e1', '   ')).rejects.toThrow('Note body required')
  })

  it('creates kind=note with note_on link', async () => {
    let notePayload: any = null
    let linkPayload: any = null
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    const src = { entity: 'sf', title: 'Src', access: 'standard' }
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_entries') {
        return makeChain({
          maybeSingle: { data: src, error: null },
          single: { data: { id: 'note-1' }, error: null },
          onInsert: (p) => { notePayload = p },
        })
      }
      if (table === 'knowledge_links') {
        return makeChain({ default: { data: null, error: null }, onInsert: (p) => { linkPayload = p } })
      }
      return makeChain()
    })
    const res = await addFollowUpNote('e1', 'Follow-up content')
    expect(res.id).toBe('note-1')
    expect(notePayload).toMatchObject({ kind: 'note', access: 'standard', entity: 'sf', body: 'Follow-up content' })
    expect(notePayload.tags).toEqual(['followup'])
    expect(linkPayload).toMatchObject({ from_entry: 'note-1', to_entry: 'e1', relation: 'note_on' })
  })

  it('rejects annotations on vault entries', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_entries') {
        return makeChain({ maybeSingle: { data: { entity: 'sf', title: 'T', access: 'vault' }, error: null } })
      }
      return makeChain()
    })
    await expect(addFollowUpNote('e1', 'body')).rejects.toThrow('Cannot annotate vault entries')
  })

  it('THROWS if knowledge_links insert returns an error (regression: silent-failure bug)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    const src = { entity: 'sf', title: 'Src', access: 'standard' }
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_entries') {
        return makeChain({
          maybeSingle: { data: src, error: null },
          single: { data: { id: 'note-1' }, error: null },
        })
      }
      if (table === 'knowledge_links') {
        return makeChain({ default: { data: null, error: { message: 'link failed' } } })
      }
      return makeChain()
    })
    await expect(addFollowUpNote('e1', 'body')).rejects.toThrow('Note saved but link failed')
  })
})

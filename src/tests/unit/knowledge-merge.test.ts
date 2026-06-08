import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock (mirrors knowledge-links-attach.test.ts) ────────────────────

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

// Force the deterministic (no-AI) draft path by default so tests don't depend
// on a key or network. The AI path is exercised by mocking the SDK separately.
const mockGetKey = vi.fn(() => undefined as string | undefined)
vi.mock('@/lib/anthropic-key', () => ({ getAnthropicApiKey: () => mockGetKey() }))

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: mockCreate }
  },
}))

const MOCK_USER = { id: 'user-1', email: 'sonja@example.com' }
const MOCK_PROFILE = { org_id: 'org-1' }

type Resp = { data?: any; error?: any }

function makeChain(responses: {
  default?: Resp
  single?: Resp
  maybeSingle?: Resp
  onInsert?: (payload: any) => void
  onUpdate?: (payload: any) => void
  onUpsert?: (payload: any) => void
  onDelete?: () => void
} = {}): any {
  const chain: any = {}
  const methods = ['select', 'eq', 'neq', 'in', 'order', 'limit', 'or', 'gte', 'ilike', 'not']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.insert = vi.fn((p: any) => { responses.onInsert?.(p); return chain })
  chain.update = vi.fn((p: any) => { responses.onUpdate?.(p); return chain })
  chain.upsert = vi.fn((p: any) => { responses.onUpsert?.(p); return chain })
  chain.delete = vi.fn(() => { responses.onDelete?.(); return chain })
  const def: Resp = responses.default ?? { data: null, error: null }
  chain.single = vi.fn().mockResolvedValue(responses.single ?? def)
  chain.maybeSingle = vi.fn().mockResolvedValue(responses.maybeSingle ?? def)
  chain.then = (resolve: any, reject?: any) => Promise.resolve(def).then(resolve, reject)
  return chain
}

import { draftMerge, commitMerge, getMergedFrom, getMergedInto } from '@/app/api/knowledge/merge'

beforeEach(() => {
  vi.clearAllMocks()
  mockGetKey.mockReturnValue(undefined)
  mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
})

const ENTRIES = [
  { id: 'e1', title: 'Idea A', kind: 'doc', access: 'standard', status: 'active', org_id: 'org-1', entity: 'sfe', tags: ['x'], body: 'alpha', parent_id: null },
  { id: 'e2', title: 'Idea B', kind: 'idea', access: 'standard', status: 'active', org_id: 'org-1', entity: 'tm', tags: ['y', 'x'], body: 'beta', parent_id: null },
]

// ── draftMerge ────────────────────────────────────────────────────────────────

describe('draftMerge', () => {
  function setup(over: { entries?: any[]; junction?: any[] } = {}) {
    const entries = over.entries ?? ENTRIES
    const junction = over.junction ?? [
      { entry_id: 'e1', entity: 'sfe' },
      { entry_id: 'e2', entity: 'tm' },
    ]
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_entries') return makeChain({ default: { data: entries, error: null } })
      if (table === 'knowledge_entry_entities') return makeChain({ default: { data: junction, error: null } })
      if (table === 'knowledge_links') return makeChain({ default: { data: [], error: null } })
      return makeChain()
    })
  }

  it('drafts a union (entities + tags) and a deterministic body without a key', async () => {
    setup()
    const d = await draftMerge(['e1', 'e2'])
    expect(d.sourceIds).toEqual(['e1', 'e2'])
    expect(d.entities).toEqual(['tm', 'sfe']) // canonical order, unioned
    expect(d.tags).toEqual(['x', 'y'])
    expect(d.hasWorkspaceSource).toBe(false)
    expect(d.kind).toBe('doc')
    expect(d.body).toContain('Idea A')
    expect(d.body).toContain('Idea B')
    expect(mockCreate).not.toHaveBeenCalled() // fallback, no AI call
  })

  it('uses the AI draft when a key is configured', async () => {
    setup()
    mockGetKey.mockReturnValue('sk-test')
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'TITLE: Combined\nTYPE: decision\n---BODY---\nmerged content' }] })
    const d = await draftMerge(['e1', 'e2'])
    expect(mockCreate).toHaveBeenCalledOnce()
    expect(d.title).toBe('Combined')
    expect(d.type_hint).toBe('decision')
    expect(d.body).toBe('merged content')
  })

  it('forces workspace kind + flags hasWorkspaceSource when a source is a workspace page', async () => {
    setup({ entries: [{ ...ENTRIES[0], kind: 'workspace' }, ENTRIES[1]] })
    const d = await draftMerge(['e1', 'e2'])
    expect(d.hasWorkspaceSource).toBe(true)
    expect(d.kind).toBe('workspace')
  })

  it('rejects fewer than two ids', async () => {
    setup()
    await expect(draftMerge(['e1'])).rejects.toThrow('at least two')
  })

  it('rejects a vault source', async () => {
    setup({ entries: [{ ...ENTRIES[0], access: 'vault' }, ENTRIES[1]] })
    await expect(draftMerge(['e1', 'e2'])).rejects.toThrow('Vault entries cannot be merged')
  })

  it('rejects an archived source', async () => {
    setup({ entries: [{ ...ENTRIES[0], status: 'archived' }, ENTRIES[1]] })
    await expect(draftMerge(['e1', 'e2'])).rejects.toThrow('Only active entries')
  })

  it('rejects a cross-org source', async () => {
    setup({ entries: [{ ...ENTRIES[0], org_id: 'other' }, ENTRIES[1]] })
    await expect(draftMerge(['e1', 'e2'])).rejects.toThrow('different org')
  })
})

// ── commitMerge ───────────────────────────────────────────────────────────────

describe('commitMerge', () => {
  function setup(over: { entries?: any[] } = {}) {
    const entries = over.entries ?? ENTRIES
    const captured = { inserts: [] as any[], updates: [] as any[], upserts: [] as any[] }
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_entries') return makeChain({
        default: { data: entries, error: null },
        single: { data: { id: 'merged-1' }, error: null },
        onInsert: p => captured.inserts.push({ table, p }),
        onUpdate: p => captured.updates.push({ table, p }),
      })
      if (table === 'knowledge_entry_entities') return makeChain({
        default: { data: [{ entry_id: 'e1', entity: 'sfe' }, { entry_id: 'e2', entity: 'tm' }], error: null },
        onUpsert: p => captured.upserts.push(p),
      })
      if (table === 'knowledge_links') return makeChain({
        default: { data: null, error: null },
        onInsert: p => captured.inserts.push({ table, p }),
      })
      return makeChain()
    })
    return captured
  }

  it('inserts the merged entry with source=merge and returns its id', async () => {
    const cap = setup()
    const res = await commitMerge({ sourceIds: ['e1', 'e2'], title: 'My Merge', body: 'merged body', entities: ['sfe', 'tm'] })
    expect(res.id).toBe('merged-1')
    const entryInsert = cap.inserts.find(i => i.table === 'knowledge_entries')
    expect(entryInsert.p).toMatchObject({ source: 'merge', access: 'standard', title: 'My Merge' })
  })

  it('writes a merged_into link for each source and archives them', async () => {
    const cap = setup()
    await commitMerge({ sourceIds: ['e1', 'e2'], title: 'M', body: 'b', entities: ['sfe'] })
    const mergeLinks = cap.inserts.filter(i => i.table === 'knowledge_links' && i.p.relation === 'merged_into')
    expect(mergeLinks.map(l => l.p.from_entry).sort()).toEqual(['e1', 'e2'])
    expect(mergeLinks.every(l => l.p.to_entry === 'merged-1')).toBe(true)
    const archives = cap.updates.filter(u => u.p.status === 'archived')
    expect(archives).toHaveLength(2)
  })

  it('attaches the union of projects to the merged result', async () => {
    const cap = setup()
    await commitMerge({ sourceIds: ['e1', 'e2'], title: 'M', body: 'b', entities: ['sfe'], projectIds: ['p1', 'p2'] })
    const attached = cap.inserts.filter(i => i.table === 'knowledge_links' && i.p.relation === 'attached')
    expect(attached.map(a => a.p.to_project).sort()).toEqual(['p1', 'p2'])
  })

  it('re-parents workspace children when a source is a workspace page', async () => {
    const cap = setup({ entries: [{ ...ENTRIES[0], kind: 'workspace' }, ENTRIES[1]] })
    await commitMerge({ sourceIds: ['e1', 'e2'], title: 'M', body: 'b', entities: ['sfe'] })
    const reparent = cap.updates.find(u => u.p.parent_id === 'merged-1')
    expect(reparent).toBeTruthy()
    // and the merged entry itself is inserted as a workspace page
    const entryInsert = cap.inserts.find(i => i.table === 'knowledge_entries')
    expect(entryInsert.p.kind).toBe('workspace')
  })

  it('requires a body and at least one entity', async () => {
    setup()
    await expect(commitMerge({ sourceIds: ['e1', 'e2'], title: 'M', body: '   ', entities: ['sfe'] }))
      .rejects.toThrow('Merged body is required')
    setup()
    await expect(commitMerge({ sourceIds: ['e1', 'e2'], title: 'M', body: 'b', entities: [] }))
      .rejects.toThrow('At least one entity')
  })
})

// ── getMergedFrom / getMergedInto ───────────────────────────────────────────────

describe('getMergedFrom', () => {
  it('returns the sources that merged into an entry (org-scoped)', async () => {
    const joined = [
      { id: 'l1', from_entry: 'e1', knowledge_entries: { id: 'e1', title: 'A', kind: 'doc', org_id: 'org-1' } },
      { id: 'l2', from_entry: 'e2', knowledge_entries: { id: 'e2', title: 'B', kind: 'idea', org_id: 'other' } },
    ]
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_links') return makeChain({ default: { data: joined, error: null } })
      return makeChain()
    })
    const out = await getMergedFrom('merged-1')
    expect(out.map(r => r.id)).toEqual(['e1']) // foreign-org row dropped
    expect(out[0]).toMatchObject({ linkId: 'l1', title: 'A' })
  })
})

describe('getMergedInto', () => {
  it('returns the merge target of an archived source', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_links') return makeChain({
        maybeSingle: { data: { id: 'l1', to_entry: 'merged-1', knowledge_entries: { id: 'merged-1', title: 'Result', kind: 'doc', org_id: 'org-1' } }, error: null },
      })
      return makeChain()
    })
    const out = await getMergedInto('e1')
    expect(out).toMatchObject({ id: 'merged-1', title: 'Result' })
  })

  it('returns null when the entry was not a merge source', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      if (table === 'knowledge_links') return makeChain({ maybeSingle: { data: null, error: null } })
      return makeChain()
    })
    expect(await getMergedInto('e1')).toBeNull()
  })
})

/**
 * Test coverage for `createEntry` and `listEntries` — both lost coverage when
 * `knowledge-actions.test.ts` was deleted in PR #18 (the deleted file tested
 * removed `classifyContent`/`createKnowledgeItem`/`searchKnowledge` APIs, but
 * `createEntry`/`listEntries` are different functions still in active use).
 *
 * Mock shape borrowed from `knowledge-update-entry.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

// classify() inside createEntry calls Anthropic. We force the fallback path
// by leaving the API key unset — `getAnthropicApiKey()` returns undefined
// and `classify()` short-circuits to its inline fallback.
vi.mock('@/lib/anthropic-key', () => ({
  getAnthropicApiKey: () => undefined,
  anthropicKeyEnvName: () => 'ANTHROPIC_DEV_API_KEY',
}))
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { create: vi.fn() } })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const MOCK_USER = { id: 'user-1', email: 'sonja@example.com' }
const MOCK_PROFILE = { org_id: 'org-1' }

interface ChainOpts {
  single?: any
  maybeSingle?: any
  default?: any
  onInsert?: (p: any) => void
  onUpdate?: (p: any) => void
  onSelect?: (p: any) => void
  onEq?: (col: string, val: any) => void
  onNeq?: (col: string, val: any) => void
  onIlike?: (col: string, val: any) => void
  onOr?: (expr: string) => void
}
function makeChain(opts: ChainOpts = {}) {
  const chain: any = {}
  chain.select = vi.fn((...args: any[]) => { opts.onSelect?.(args); return chain })
  chain.eq = vi.fn((col: string, val: any) => { opts.onEq?.(col, val); return chain })
  chain.neq = vi.fn((col: string, val: any) => { opts.onNeq?.(col, val); return chain })
  chain.ilike = vi.fn((col: string, val: any) => { opts.onIlike?.(col, val); return chain })
  chain.or = vi.fn((expr: string) => { opts.onOr?.(expr); return chain })
  ;['in', 'order', 'limit', 'delete', 'gte', 'lte'].forEach(m => {
    chain[m] = vi.fn(() => chain)
  })
  chain.insert = vi.fn((p: any) => { opts.onInsert?.(p); return chain })
  chain.update = vi.fn((p: any) => { opts.onUpdate?.(p); return chain })
  chain.single = vi.fn().mockResolvedValue(opts.single ?? opts.default ?? { data: null, error: null })
  chain.maybeSingle = vi.fn().mockResolvedValue(opts.maybeSingle ?? opts.default ?? { data: null, error: null })
  // Terminal awaits (e.g. listEntries) bottom out here.
  chain.then = (resolve: any, reject?: any) =>
    Promise.resolve(opts.default ?? { data: null, error: null }).then(resolve, reject)
  return chain
}

function wireAuth() {
  mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
}

import { createEntry, listEntries } from '@/app/api/knowledge/actions'

beforeEach(() => { vi.clearAllMocks() })

// ────────────────────────────────────────────────────────────────────────────
// listEntries
// ────────────────────────────────────────────────────────────────────────────

describe('listEntries', () => {
  it('throws if the caller is not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(listEntries()).rejects.toThrow('Not authenticated')
  })

  it('throws if the user has no profile (no org)', async () => {
    wireAuth()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return makeChain({ single: { data: null, error: null } })
      }
      return makeChain()
    })
    await expect(listEntries()).rejects.toThrow('No profile')
  })

  it('returns rows with default filters (active, non-critique)', async () => {
    wireAuth()
    const rows = [
      { id: 'e1', kind: 'doc', title: 'A', status: 'active' },
      { id: 'e2', kind: 'note', title: 'B', status: 'active' },
    ]
    const seenEq: Array<[string, any]> = []
    const seenNeq: Array<[string, any]> = []
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      }
      return makeChain({
        default: { data: rows, error: null },
        onEq: (col, val) => seenEq.push([col, val]),
        onNeq: (col, val) => seenNeq.push([col, val]),
      })
    })
    const out = await listEntries()
    expect(out).toEqual(rows)
    // Default: scoped to standard access + active + non-critique.
    expect(seenEq).toContainEqual(['access', 'standard'])
    expect(seenEq).toContainEqual(['status', 'active'])
    expect(seenNeq).toContainEqual(['kind', 'critique'])
  })

  it('forwards explicit kind + entity + query into the query builder', async () => {
    wireAuth()
    const seenEq: Array<[string, any]> = []
    let seenOr: string | undefined
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      }
      return makeChain({
        default: { data: [], error: null },
        onEq: (col, val) => seenEq.push([col, val]),
        onOr: (expr) => { seenOr = expr },
      })
    })
    await listEntries({ kind: 'idea', entity: 'sf', query: 'hello' })
    expect(seenEq).toContainEqual(['kind', 'idea'])
    expect(seenEq).toContainEqual(['entity', 'sf'])
    expect(seenOr).toBe('title.ilike.%hello%,body.ilike.%hello%')
  })

  it('surfaces a Postgres error wrapped in a clear message', async () => {
    wireAuth()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      }
      return makeChain({
        default: { data: null, error: { message: 'permission denied for relation knowledge_entries' } },
      })
    })
    await expect(listEntries()).rejects.toThrow(/Failed to list entries.*permission denied/)
  })
})

// ────────────────────────────────────────────────────────────────────────────
// createEntry
// ────────────────────────────────────────────────────────────────────────────

describe('createEntry', () => {
  function wire(captured: { inserts: any[] }, insertResult?: { data?: any; error?: any }) {
    wireAuth()
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        return makeChain({ single: { data: MOCK_PROFILE, error: null } })
      }
      // knowledge_entries insert returns {data:{id}}.
      return makeChain({
        single: insertResult ?? { data: { id: 'new-id' }, error: null },
        onInsert: (p) => captured.inserts.push(p),
      })
    })
  }

  it('throws if the body is empty', async () => {
    wireAuth()
    await expect(createEntry({ body: '   ', entity: 'sf' })).rejects.toThrow('Body is required')
  })

  it('throws if the entity is not in the allowed list', async () => {
    wireAuth()
    await expect(createEntry({ body: 'something', entity: 'xx' as any })).rejects.toThrow('Invalid entity')
  })

  it('happy path: inserts with sensible defaults when no title/type_hint given', async () => {
    const cap = { inserts: [] as any[] }
    wire(cap)
    const out = await createEntry({ body: 'first line of body\nsecond line', entity: 'sf' })
    expect(out).toEqual({ id: 'new-id' })
    expect(cap.inserts).toHaveLength(1)
    const row = cap.inserts[0]
    expect(row).toMatchObject({
      org_id: 'org-1',
      user_id: 'user-1',
      access: 'standard',
      entity: 'sf',
      kind: 'note',             // default kind
      idea_status: null,        // only set for 'idea'
      source: 'manual',
    })
    // Fallback classify() uses the first line as a title when Anthropic is unavailable.
    expect(row.title).toBe('first line of body')
    expect(row.body).toBe('first line of body\nsecond line')
  })

  it('honors the explicit title + type_hint and skips classify', async () => {
    const cap = { inserts: [] as any[] }
    wire(cap)
    await createEntry({
      body: 'whatever',
      entity: 'tm',
      title: 'My Picked Title',
      type_hint: 'decision',
      tags: ['picked'],
    })
    const row = cap.inserts[0]
    expect(row.title).toBe('My Picked Title')
    expect(row.type_hint).toBe('decision')
    expect(row.tags).toEqual(['picked'])
  })

  it('sets idea_status="raw" when kind is "idea"', async () => {
    const cap = { inserts: [] as any[] }
    wire(cap)
    await createEntry({ body: 'shower thought', entity: 'personal', kind: 'idea' })
    expect(cap.inserts[0].kind).toBe('idea')
    expect(cap.inserts[0].idea_status).toBe('raw')
  })

  it('wraps a Postgres insert error in a clear message', async () => {
    const cap = { inserts: [] as any[] }
    wire(cap, { data: null, error: { message: 'duplicate key value' } })
    await expect(createEntry({ body: 'x', entity: 'sf' })).rejects.toThrow(/Failed to create entry.*duplicate key/)
  })
})

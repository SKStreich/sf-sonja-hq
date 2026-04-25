import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { create: vi.fn() } })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const MOCK_USER = { id: 'user-1', email: 'sonja@example.com' }
const MOCK_PROFILE = { org_id: 'org-1' }

function makeChain(opts: {
  single?: any
  maybeSingle?: any
  default?: any
  onInsert?: (p: any) => void
  onUpdate?: (p: any) => void
} = {}) {
  const chain: any = {}
  ;['select', 'eq', 'neq', 'in', 'order', 'limit', 'delete', 'or', 'gte'].forEach(m => {
    chain[m] = vi.fn(() => chain)
  })
  chain.insert = vi.fn((p: any) => { opts.onInsert?.(p); return chain })
  chain.update = vi.fn((p: any) => { opts.onUpdate?.(p); return chain })
  chain.single = vi.fn().mockResolvedValue(opts.single ?? opts.default ?? { data: null, error: null })
  chain.maybeSingle = vi.fn().mockResolvedValue(opts.maybeSingle ?? opts.default ?? { data: null, error: null })
  chain.then = (resolve: any, reject?: any) =>
    Promise.resolve(opts.default ?? { data: null, error: null }).then(resolve, reject)
  return chain
}

/** Current entry returned by getEntry(). */
const CURRENT = {
  id: 'e1',
  kind: 'idea',
  access: 'standard',
  entity: 'sf',
  title: 'Original title',
  body: 'Original body',
  summary: null,
  type_hint: 'strategy',
  idea_status: 'raw',
  status: 'active',
  tags: ['alpha'],
  version: 3,
  classification_overridden: false,
}

/**
 * Helper: wire mocks for updateEntry. Captures knowledge_versions inserts
 * and knowledge_entries updates.
 */
function wire(captured: { inserts: any[]; updates: any[] }) {
  mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
  mockFrom.mockImplementation((table: string) => {
    if (table === 'user_profiles') {
      return makeChain({ single: { data: MOCK_PROFILE, error: null } })
    }
    if (table === 'knowledge_entries') {
      return makeChain({
        maybeSingle: { data: CURRENT, error: null },
        default: { data: null, error: null },
        onUpdate: (p) => captured.updates.push(p),
      })
    }
    if (table === 'knowledge_versions') {
      return makeChain({
        default: { data: null, error: null },
        onInsert: (p) => captured.inserts.push(p),
      })
    }
    return makeChain()
  })
}

import { updateEntry } from '@/app/api/knowledge/actions'

beforeEach(() => { vi.clearAllMocks() })

describe('updateEntry — snapshot on any change', () => {
  it('snapshots and bumps version when TITLE changes', async () => {
    const cap = { inserts: [] as any[], updates: [] as any[] }
    wire(cap)
    await updateEntry('e1', { title: 'New title' })
    expect(cap.inserts).toHaveLength(1)
    expect(cap.inserts[0]).toMatchObject({
      entry_id: 'e1',
      version: 3,           // snapshotted PRIOR version number
      title: 'Original title',
    })
    expect(cap.updates[0].version).toBe(4)
  })

  it('snapshots and bumps version when BODY changes', async () => {
    const cap = { inserts: [] as any[], updates: [] as any[] }
    wire(cap)
    await updateEntry('e1', { body: 'New body' })
    expect(cap.inserts).toHaveLength(1)
    expect(cap.updates[0].version).toBe(4)
  })

  it('snapshots when KIND changes', async () => {
    const cap = { inserts: [] as any[], updates: [] as any[] }
    wire(cap)
    await updateEntry('e1', { kind: 'note' })
    expect(cap.inserts).toHaveLength(1)
  })

  it('snapshots when ENTITY changes', async () => {
    const cap = { inserts: [] as any[], updates: [] as any[] }
    wire(cap)
    await updateEntry('e1', { entity: 'tm' })
    expect(cap.inserts).toHaveLength(1)
  })

  it('snapshots when TAGS change', async () => {
    const cap = { inserts: [] as any[], updates: [] as any[] }
    wire(cap)
    await updateEntry('e1', { tags: ['alpha', 'beta'] })
    expect(cap.inserts).toHaveLength(1)
  })

  it('snapshots when TYPE_HINT changes', async () => {
    const cap = { inserts: [] as any[], updates: [] as any[] }
    wire(cap)
    await updateEntry('e1', { type_hint: 'decision' })
    expect(cap.inserts).toHaveLength(1)
    expect(cap.updates[0].classification_overridden).toBe(true)
  })

  it('snapshots when IDEA_STATUS changes', async () => {
    const cap = { inserts: [] as any[], updates: [] as any[] }
    wire(cap)
    await updateEntry('e1', { idea_status: 'approved' })
    expect(cap.inserts).toHaveLength(1)
  })

  it('does NOT snapshot when patch matches current values', async () => {
    const cap = { inserts: [] as any[], updates: [] as any[] }
    wire(cap)
    await updateEntry('e1', { title: 'Original title', body: 'Original body', tags: ['alpha'] })
    expect(cap.inserts).toHaveLength(0)
    expect(cap.updates[0].version).toBeUndefined()
  })

  it('does NOT snapshot when only STATUS changes (archive toggle)', async () => {
    const cap = { inserts: [] as any[], updates: [] as any[] }
    wire(cap)
    await updateEntry('e1', { status: 'archived' })
    expect(cap.inserts).toHaveLength(0)
    expect(cap.updates[0]).toEqual({ status: 'archived' })
  })
})

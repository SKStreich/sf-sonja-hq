/**
 * Server reader (api/knowledge/nodes.ts) — triage routing + inbox count.
 * Sprint 13 · Inbox & Triage T1. The three store readers are mocked; we assert
 * the orchestration: D4 (filed scope excludes inbox + includes db/vault) and the
 * inbox scope being entries-only.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockListEntries = vi.fn()
const mockListDatabases = vi.fn()
const mockListVault = vi.fn()

vi.mock('@/app/api/knowledge/actions', () => ({ listEntries: (o: any) => mockListEntries(o) }))
vi.mock('@/app/api/knowledge/databases', () => ({ listDatabases: () => mockListDatabases() }))
vi.mock('@/app/api/knowledge/vault', () => ({ listVaultEntries: () => mockListVault() }))

// countInbox uses a head-count query over the RLS-scoped client.
const mockSelect = vi.fn()
const headChain: any = {
  select: (...a: any[]) => { mockSelect(...a); return headChain },
  eq: () => headChain,
  then: (res: any) => Promise.resolve({ count: 7, error: null }).then(res),
}
vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ from: () => headChain }),
}))

import { listNodes, countInbox } from '@/app/api/knowledge/nodes'

const entry = (id: string, kind = 'note') => ({
  id, kind, title: id, entities: ['tm'], updated_at: '2026-01-01T00:00:00Z',
})

beforeEach(() => {
  vi.clearAllMocks()
  mockListDatabases.mockResolvedValue([])
  mockListVault.mockResolvedValue([])
})

describe('listNodes triage routing', () => {
  it('defaults to the filed scope and reads all three stores', async () => {
    mockListEntries.mockResolvedValue([entry('e1')])
    await listNodes()
    expect(mockListEntries).toHaveBeenCalledWith(expect.objectContaining({ triage: 'filed' }))
    expect(mockListDatabases).toHaveBeenCalled()
    expect(mockListVault).toHaveBeenCalled()
  })

  it('inbox scope is entries-only — it skips the database + vault reads', async () => {
    mockListEntries.mockResolvedValue([entry('i1')])
    const nodes = await listNodes({ triage: 'inbox' })
    expect(mockListEntries).toHaveBeenCalledWith(expect.objectContaining({ triage: 'inbox' }))
    expect(mockListDatabases).not.toHaveBeenCalled()
    expect(mockListVault).not.toHaveBeenCalled()
    expect(nodes.map(n => n.id)).toEqual(['i1'])
  })
})

describe('countInbox', () => {
  it('returns the head count of inbox entries', async () => {
    expect(await countInbox()).toBe(7)
    // head:true so no rows are materialized.
    expect(mockSelect).toHaveBeenCalledWith('id', { count: 'exact', head: true })
  })
})

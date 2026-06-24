/**
 * importInboxBatch (Sprint 13 T3) — non-destructive bulk import. Asserts known
 * refs are skipped and only new items are inserted as inbox entries with lineage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: mockGetUser }, from: mockFrom }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { importInboxBatch } from '@/app/api/knowledge/import'
import { bulkItemRef } from '@/lib/knowledge/bulk-import'

const item = (body: string) => ({ body, title: body, ref: bulkItemRef(body) })

beforeEach(() => { vi.clearAllMocks() })

function wire(existingRefs: string[], inserts: any[]) {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  mockFrom.mockImplementation((table: string) => {
    const chain: any = {}
    ;['select', 'eq', 'in', 'insert'].forEach(m => { chain[m] = vi.fn(() => chain) })
    chain.insert = vi.fn((p: any) => { inserts.push(p); return chain })
    chain.single = vi.fn().mockResolvedValue(
      table === 'user_profiles' ? { data: { org_id: 'org1' }, error: null } : { data: { id: 'new' }, error: null },
    )
    // The existing-refs read awaits the chain directly.
    chain.then = (res: any) =>
      Promise.resolve({ data: existingRefs.map(r => ({ external_ref: r })), error: null }).then(res)
    return chain
  })
}

describe('importInboxBatch', () => {
  it('inserts new items and skips refs that already exist', async () => {
    const a = item('alpha'), b = item('beta')
    const inserts: any[] = []
    wire([a.ref], inserts) // alpha already imported
    const res = await importInboxBatch({ items: [a, b], source: 'bulk_paste' })
    expect(res).toEqual({ created: 1, skipped: 1 })
    expect(inserts).toHaveLength(1)
    expect(inserts[0]).toMatchObject({
      triage_status: 'inbox',
      external_source: 'bulk_paste',
      external_ref: b.ref,
      kind: 'note',
    })
  })

  it('returns zero counts for an empty batch', async () => {
    wire([], [])
    expect(await importInboxBatch({ items: [] })).toEqual({ created: 0, skipped: 0 })
  })

  it('throws when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(importInboxBatch({ items: [item('x')] })).rejects.toThrow('Not authenticated')
  })
})

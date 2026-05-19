import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()
const mockAdminFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: mockAdminFrom }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const MOCK_USER = { id: 'user-1', email: 'sonja@example.com' }

type Resp = { data?: any; error?: any }

function makeChain(resp: Resp = { data: null, error: null }) {
  const chain: any = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'limit']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.single = vi.fn().mockResolvedValue(resp)
  chain.maybeSingle = vi.fn().mockResolvedValue(resp)
  chain.then = (resolve: any) => Promise.resolve(resp).then(resolve)
  return chain
}

import { createShare, listShares, revokeShare, resolveShareToken } from '@/app/api/knowledge/shares'

describe('createShare', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns a token and id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation(() => makeChain({ data: { id: 'share-1' }, error: null }))
    const result = await createShare({ itemId: 'kb-1', expiresInDays: 7 })
    expect(result.id).toBe('share-1')
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{20,}$/)
  })

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(createShare({ itemId: 'kb-1' })).rejects.toThrow('Not authenticated')
  })
})

describe('listShares', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns rows from table', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation(() => makeChain({ data: [{ id: 's1' }, { id: 's2' }], error: null }))
    const rows = await listShares('kb-1')
    expect(rows).toHaveLength(2)
  })
})

describe('revokeShare', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sets revoked=true', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    await revokeShare('share-1', 'kb-1')
    expect(mockFrom).toHaveBeenCalledWith('knowledge_shares')
  })
})

describe('resolveShareToken', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns null for empty token', async () => {
    const result = await resolveShareToken('')
    expect(result).toBeNull()
  })

  it('returns null when share not found', async () => {
    mockAdminFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    const result = await resolveShareToken('abcdef1234567890')
    expect(result).toBeNull()
  })

  it('returns null when share is revoked', async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'knowledge_shares') return makeChain({
        data: { item_id: 'kb-1', revoked: true, expires_at: null },
        error: null,
      })
      return makeChain()
    })
    const result = await resolveShareToken('abcdef1234567890')
    expect(result).toBeNull()
  })

  it('returns null when share is expired', async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'knowledge_shares') return makeChain({
        data: { item_id: 'kb-1', revoked: false, expires_at: new Date(Date.now() - 86400000).toISOString() },
        error: null,
      })
      return makeChain()
    })
    const result = await resolveShareToken('abcdef1234567890')
    expect(result).toBeNull()
  })

  it('returns null when item is archived', async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'knowledge_shares') return makeChain({
        data: { item_id: 'kb-1', revoked: false, expires_at: null },
        error: null,
      })
      if (table === 'knowledge_items') return makeChain({
        data: { title: 'T', body: 'B', entity: 'sf', type: 'decision', updated_at: 'now', status: 'archived' },
        error: null,
      })
      return makeChain()
    })
    const result = await resolveShareToken('abcdef1234567890')
    expect(result).toBeNull()
  })

  it('returns item when token is valid', async () => {
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'knowledge_shares') return makeChain({
        data: { item_id: 'kb-1', revoked: false, expires_at: null },
        error: null,
      })
      if (table === 'knowledge_items') return makeChain({
        data: { title: 'Auth Decision', body: 'Use magic links', entity: 'sf', type: 'decision', updated_at: '2026-04-24', status: 'active' },
        error: null,
      })
      return makeChain()
    })
    const result = await resolveShareToken('abcdef1234567890')
    expect(result).toEqual({
      title: 'Auth Decision',
      body: 'Use magic links',
      entity: 'sf',
      type: 'decision',
      updated_at: '2026-04-24',
    })
  })
})

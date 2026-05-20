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
  const methods = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'order', 'limit']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.single = vi.fn().mockResolvedValue(resp)
  chain.maybeSingle = vi.fn().mockResolvedValue(resp)
  chain.then = (resolve: any) => Promise.resolve(resp).then(resolve)
  return chain
}

import { createShare, listShares, revokeShare, resolveShareToken } from '@/app/api/knowledge/shares'

const VALID_SHARE_INPUT = {
  entryId: 'kb-1',
  recipientName: 'Alex',
  recipientEmail: 'alex@example.com',
  expiresInDays: 7,
  versionLock: false,
}

describe('createShare', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns a token and id', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ data: { org_id: 'org-1' }, error: null })
      return makeChain({ data: { id: 'share-1' }, error: null })
    })
    const result = await createShare(VALID_SHARE_INPUT)
    expect(result.id).toBe('share-1')
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{20,}$/)
  })

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(createShare(VALID_SHARE_INPUT)).rejects.toThrow('Not authenticated')
  })
})

describe('listShares', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns rows from table', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ data: { org_id: 'org-1' }, error: null })
      return makeChain({ data: [{ id: 's1' }, { id: 's2' }], error: null })
    })
    const rows = await listShares('kb-1')
    expect(rows).toHaveLength(2)
  })
})

describe('revokeShare', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sets revoked_at timestamp', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ data: { org_id: 'org-1' }, error: null })
      return makeChain({ data: null, error: null })
    })
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

  it('returns null when entry is archived', async () => {
    const future = new Date(Date.now() + 86400000).toISOString()
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'knowledge_shares') return makeChain({
        data: { id: 'share-1', org_id: 'org-1', entry_id: 'kb-1', version_id: null, recipient_name: 'Alex', recipient_email: 'alex@example.com', expires_at: future, revoked_at: null },
        error: null,
      })
      if (table === 'knowledge_entries') return makeChain({
        data: { title: 'T', body: 'B', mime_type: 'text/plain', storage_path: null, rendered_html: null, status: 'archived' },
        error: null,
      })
      return makeChain()
    })
    const result = await resolveShareToken('abcdef1234567890')
    expect(result).toBeNull()
  })

  it('returns a plain-text SharedView when token is valid', async () => {
    const future = new Date(Date.now() + 86400000).toISOString()
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === 'knowledge_shares') return makeChain({
        data: { id: 'share-1', org_id: 'org-1', entry_id: 'kb-1', version_id: null, recipient_name: 'Alex', recipient_email: 'alex@example.com', expires_at: future, revoked_at: null },
        error: null,
      })
      if (table === 'knowledge_entries') return makeChain({
        data: { title: 'Auth Decision', body: 'Use magic links', mime_type: 'text/markdown', storage_path: null, rendered_html: null, status: 'active' },
        error: null,
      })
      if (table === 'contacts') return makeChain({ data: { consent_to_contact: false }, error: null })
      return makeChain()
    })
    const result = await resolveShareToken('abcdef1234567890')
    expect(result).toMatchObject({
      kind: 'text',
      title: 'Auth Decision',
      text: 'Use magic links',
      markdown: true,
      recipient: 'Alex',
      recipientEmail: 'alex@example.com',
      consent: false,
    })
  })
})

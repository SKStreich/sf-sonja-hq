import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
const mockFrom = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

const mockNotionSearch = vi.fn()
vi.mock('@/lib/notion/client', () => ({
  createNotionClient: () => ({ search: mockNotionSearch }),
  isNotionConfigured: vi.fn(() => true),
}))

const MOCK_USER = { id: 'user-1', email: 'sonja@example.com' }
const MOCK_PROFILE = { org_id: 'org-1' }

function makeChain(response: any = { data: null, error: null }) {
  const chain: any = {}
  const methods = ['select', 'eq', 'update', 'upsert', 'delete', 'order', 'single', 'maybeSingle']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.single = vi.fn().mockResolvedValue(response)
  chain.maybeSingle = vi.fn().mockResolvedValue(response)
  return chain
}

function setupMocks(tableOverrides: Record<string, any> = {}) {
  mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
  mockFrom.mockImplementation((table: string) => {
    const response = tableOverrides[table] ?? { data: null, error: null }
    const chain = makeChain(response)
    chain.upsert = vi.fn().mockResolvedValue({ data: null, error: null })
    chain.delete = vi.fn().mockReturnThis()
    chain.eq = vi.fn().mockReturnThis()
    chain.select = vi.fn().mockReturnThis()
    chain.update = vi.fn().mockReturnThis()
    chain.single = vi.fn().mockResolvedValue(response)
    return chain
  })
}

import { syncNotionPages, linkProjectToNotion, deleteDocument } from '@/app/api/documents/actions'

describe('syncNotionPages', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns error when Notion is not configured', async () => {
    const { isNotionConfigured } = await import('@/lib/notion/client')
    vi.mocked(isNotionConfigured).mockReturnValueOnce(false)
    const result = await syncNotionPages()
    expect(result.error).toContain('NOTION_API_KEY')
    expect(result.synced).toBe(0)
  })

  it('syncs pages returned by Notion search', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockNotionSearch.mockResolvedValue({
      results: [
        {
          object: 'page',
          id: 'notion-page-1',
          url: 'https://notion.so/test-page',
          last_edited_time: '2026-04-18T10:00:00Z',
          properties: {
            title: {
              type: 'title',
              title: [{ plain_text: 'My Notion Page' }],
            },
          },
        },
        {
          object: 'page',
          id: 'notion-page-2',
          url: 'https://notion.so/another-page',
          last_edited_time: '2026-04-17T10:00:00Z',
          properties: {
            Name: {
              type: 'title',
              title: [{ plain_text: 'Another Page' }],
            },
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    })
    const result = await syncNotionPages()
    expect(result.error).toBeNull()
    expect(result.synced).toBe(2)
  })

  it('skips pages with no title', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockNotionSearch.mockResolvedValue({
      results: [
        {
          object: 'page',
          id: 'notion-page-no-title',
          url: 'https://notion.so/no-title',
          properties: {
            title: { type: 'title', title: [] },
          },
        },
      ],
      has_more: false,
      next_cursor: null,
    })
    const result = await syncNotionPages()
    expect(result.error).toBeNull()
    expect(result.synced).toBe(0)
  })

  it('handles paginated Notion results', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockNotionSearch
      .mockResolvedValueOnce({
        results: [{
          object: 'page', id: 'p1', url: 'https://notion.so/p1',
          properties: { title: { type: 'title', title: [{ plain_text: 'Page 1' }] } },
        }],
        has_more: true,
        next_cursor: 'cursor-abc',
      })
      .mockResolvedValueOnce({
        results: [{
          object: 'page', id: 'p2', url: 'https://notion.so/p2',
          properties: { title: { type: 'title', title: [{ plain_text: 'Page 2' }] } },
        }],
        has_more: false,
        next_cursor: null,
      })
    const result = await syncNotionPages()
    expect(result.synced).toBe(2)
    expect(mockNotionSearch).toHaveBeenCalledTimes(2)
  })

  it('returns error when Notion API throws', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockNotionSearch.mockRejectedValue(new Error('Notion API rate limited'))
    const result = await syncNotionPages()
    expect(result.error).toContain('rate limited')
    expect(result.synced).toBe(0)
  })
})

describe('linkProjectToNotion', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updates notion_url on the project', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    await expect(linkProjectToNotion('project-1', 'https://notion.so/my-page')).resolves.not.toThrow()
  })

  it('accepts null to unlink', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    await expect(linkProjectToNotion('project-1', null)).resolves.not.toThrow()
  })
})

describe('deleteDocument', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('deletes the document record', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    await expect(deleteDocument('doc-1')).resolves.not.toThrow()
  })
})

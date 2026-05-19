import { describe, it, expect, vi, beforeEach } from 'vitest'

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
vi.mock('@/app/api/usage/actions', () => ({ logAnthropicCall: vi.fn() }))

const MOCK_USER = { id: 'user-1', email: 'sonja@example.com' }
const MOCK_PROFILE = { org_id: 'org-1' }

type Resp = { data?: any; error?: any }

function makeChain(resp: Resp = { data: null, error: null }) {
  const chain: any = {}
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'lt', 'not', 'order', 'limit', 'or']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.single = vi.fn().mockResolvedValue(resp)
  chain.then = (resolve: any) => Promise.resolve(resp).then(resolve)
  return chain
}

function setupMocks(tables: Record<string, Resp> = {}) {
  mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
  mockFrom.mockImplementation((table: string) => {
    const resp = tables[table] ?? { data: null, error: null }
    return makeChain(resp)
  })
}

import {
  classifyContent,
  createKnowledgeItem,
  updateKnowledgeItem,
  overrideClassification,
  searchKnowledge,
} from '@/app/api/knowledge/actions'

describe('classifyContent', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('falls back to first line + low confidence when no API key', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const result = await classifyContent('Decision: ship Friday\nMore context here')
    expect(result.title).toBe('Decision: ship Friday')
    expect(result.type).toBe('strategy')
    expect(result.confidence).toBe(0.3)
  })

  it('parses valid Claude JSON response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        title: 'Auth rewrite decision',
        type: 'decision',
        entity: 'sf',
        tags: ['auth', 'security'],
        confidence: 0.92,
      }) }],
      usage: { input_tokens: 10, output_tokens: 20 },
    })
    const result = await classifyContent('We decided to migrate to magic links.')
    expect(result.title).toBe('Auth rewrite decision')
    expect(result.type).toBe('decision')
    expect(result.entity).toBe('sf')
    expect(result.tags).toEqual(['auth', 'security'])
    expect(result.confidence).toBeCloseTo(0.92)
  })

  it('coerces invalid type to strategy and clamps confidence', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify({
        title: 'x',
        type: 'bogus',
        entity: 'nope',
        tags: 'not-array',
        confidence: 5,
      }) }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    const result = await classifyContent('hi', { entity: 'tm' })
    expect(result.type).toBe('strategy')
    expect(result.entity).toBe('tm')
    expect(result.tags).toEqual([])
    expect(result.confidence).toBe(1)
  })

  it('throws on empty body', async () => {
    await expect(classifyContent('   ')).rejects.toThrow('Body is required')
  })

  it('throws on unparseable response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not json at all' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    })
    await expect(classifyContent('content')).rejects.toThrow('Failed to parse')
  })
})

describe('createKnowledgeItem', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('inserts item with classification fallback and seeds v1', async () => {
    delete process.env.ANTHROPIC_API_KEY
    setupMocks({
      user_profiles: { data: MOCK_PROFILE, error: null },
      knowledge_items: { data: { id: 'kb-1' }, error: null },
      knowledge_versions: { data: null, error: null },
    })
    const result = await createKnowledgeItem({ body: 'A new strategy note', entity: 'tm' })
    expect(result.id).toBe('kb-1')
    expect(mockFrom).toHaveBeenCalledWith('knowledge_items')
    expect(mockFrom).toHaveBeenCalledWith('knowledge_versions')
  })

  it('throws when body is empty', async () => {
    await expect(createKnowledgeItem({ body: '  ' })).rejects.toThrow('Body is required')
  })
})

describe('updateKnowledgeItem', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('bumps version and records snapshot when body changes', async () => {
    setupMocks({
      user_profiles: { data: MOCK_PROFILE, error: null },
      knowledge_items: { data: { body: 'old', version: 3 }, error: null },
      knowledge_versions: { data: null, error: null },
    })
    await updateKnowledgeItem({ id: 'kb-1', body: 'new body' })
    // Called: user_profiles (ctx), knowledge_items (select), knowledge_items (update), knowledge_versions (insert)
    expect(mockFrom).toHaveBeenCalledWith('knowledge_versions')
  })

  it('does not insert a version row if only title changes', async () => {
    setupMocks({
      user_profiles: { data: MOCK_PROFILE, error: null },
      knowledge_items: { data: { body: 'same', version: 1 }, error: null },
    })
    await updateKnowledgeItem({ id: 'kb-1', title: 'new title' })
    const versionCalls = mockFrom.mock.calls.filter(c => c[0] === 'knowledge_versions')
    expect(versionCalls).toHaveLength(0)
  })
})

describe('overrideClassification', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('sets classification_overridden flag', async () => {
    setupMocks({
      user_profiles: { data: MOCK_PROFILE, error: null },
      knowledge_items: { data: null, error: null },
    })
    await overrideClassification('kb-1', { type: 'decision', entity: 'sf', tags: ['a'] })
    expect(mockFrom).toHaveBeenCalledWith('knowledge_items')
  })
})

describe('searchKnowledge', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns items from query', async () => {
    setupMocks({
      user_profiles: { data: MOCK_PROFILE, error: null },
      knowledge_items: { data: [{ id: 'a' }, { id: 'b' }], error: null },
    })
    const items = await searchKnowledge({ query: 'auth', entity: 'sf', type: 'decision' })
    expect(items).toHaveLength(2)
  })
})

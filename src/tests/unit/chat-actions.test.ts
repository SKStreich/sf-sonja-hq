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

const MOCK_USER = { id: 'user-1', email: 'sonja@example.com' }
const MOCK_PROFILE = { org_id: 'org-1' }

function makeChain(response: any = { data: null, error: null }) {
  const chain: any = {}
  const methods = ['select', 'eq', 'update', 'insert', 'delete', 'order', 'single']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.single = vi.fn().mockResolvedValue(response)
  return chain
}

function setupMocks(tableOverrides: Record<string, any> = {}) {
  mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
  mockFrom.mockImplementation((table: string) => {
    const response = tableOverrides[table] ?? { data: null, error: null }
    const chain = makeChain(response)
    chain.insert = vi.fn().mockResolvedValue({ data: null, error: null })
    chain.update = vi.fn().mockReturnThis()
    chain.delete = vi.fn().mockReturnThis()
    chain.eq = vi.fn().mockReturnThis()
    chain.single = vi.fn().mockResolvedValue(response)
    return chain
  })
}

import { addChatEntry, updateChatEntry, deleteChatEntry, extractChatInsights } from '@/app/api/chats/actions'

describe('addChatEntry', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('inserts a chat entry with all fields', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    await expect(addChatEntry({
      title: 'Sprint planning call',
      summary: 'Planned sprint 5 work.',
      key_decisions: ['Build chat index', 'Use AI extraction'],
      entity_id: 'entity-1',
      url: 'https://claude.ai/chat/abc',
      chat_date: '2026-04-18',
      tags: ['planning', 'sprint-5'],
    })).resolves.not.toThrow()
  })

  it('inserts a minimal chat entry (title only)', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    await expect(addChatEntry({ title: 'Quick debug session' })).resolves.not.toThrow()
  })

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(addChatEntry({ title: 'Test' })).rejects.toThrow('Not authenticated')
  })

  it('throws when supabase insert fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') {
        const chain = makeChain({ data: MOCK_PROFILE, error: null })
        chain.single = vi.fn().mockResolvedValue({ data: MOCK_PROFILE, error: null })
        return chain
      }
      const chain = makeChain({ data: null, error: { message: 'DB error' } })
      chain.insert = vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } })
      return chain
    })
    await expect(addChatEntry({ title: 'Test' })).rejects.toThrow('Failed to save chat entry')
  })
})

describe('updateChatEntry', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updates chat fields without throwing', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    await expect(updateChatEntry('chat-1', {
      title: 'Updated title',
      tags: ['new-tag'],
    })).resolves.not.toThrow()
  })

  it('updates only the provided fields', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    await expect(updateChatEntry('chat-1', { summary: 'New summary' })).resolves.not.toThrow()
  })
})

describe('deleteChatEntry', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('deletes a chat entry by id', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    await expect(deleteChatEntry('chat-1')).resolves.not.toThrow()
  })
})

describe('extractChatInsights', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns parsed insights from Claude API response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const fakeInsights = {
      title: 'Auth debugging session',
      summary: 'Fixed token expiry handling.',
      key_decisions: ['Use refresh tokens', 'Add logging'],
      suggested_tags: ['auth', 'supabase'],
      entity_hint: 'sf',
    }
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(fakeInsights) }],
    })
    const result = await extractChatInsights('Human: hello\nAssistant: hi')
    expect(result.title).toBe('Auth debugging session')
    expect(result.key_decisions).toHaveLength(2)
    expect(result.entity_hint).toBe('sf')
    expect(result.suggested_tags).toContain('auth')
  })

  it('handles JSON wrapped in markdown code fences', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const fakeInsights = {
      title: 'Fenced response',
      summary: 'Some summary.',
      key_decisions: ['Decision 1'],
      suggested_tags: ['tag1'],
      entity_hint: null,
    }
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(fakeInsights) + '\n```' }],
    })
    const result = await extractChatInsights('raw text')
    expect(result.title).toBe('Fenced response')
    expect(result.entity_hint).toBeNull()
  })

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    const originalKey = process.env.ANTHROPIC_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    await expect(extractChatInsights('text')).rejects.toThrow('ANTHROPIC_API_KEY')
    process.env.ANTHROPIC_API_KEY = originalKey
  })

  it('throws when Claude returns invalid JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json at all' }],
    })
    await expect(extractChatInsights('text')).rejects.toThrow('Failed to parse AI response')
  })

  it('provides default values for missing fields', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
    })
    const result = await extractChatInsights('text')
    expect(result.title).toBe('Untitled Chat')
    expect(result.key_decisions).toEqual([])
    expect(result.suggested_tags).toEqual([])
    expect(result.entity_hint).toBeNull()
  })
})

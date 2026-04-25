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

function makeChain(response: any = { data: [], error: null, count: 0 }) {
  const chain: any = {}
  const methods = ['select', 'eq', 'not', 'lt', 'order', 'limit', 'single', 'ilike', 'insert', 'update']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.single = vi.fn().mockResolvedValue(response)
  chain.then = (resolve: any) => Promise.resolve(response).then(resolve)
  return chain
}

function setupMocks(overrides: Record<string, any> = {}) {
  mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
  mockFrom.mockImplementation((table: string) => {
    const resp = overrides[table] ?? { data: [], error: null }
    return makeChain(resp)
  })
}

import { sendAgentMessage } from '@/app/api/agent/actions'

describe('sendAgentMessage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.ANTHROPIC_API_KEY = 'test-key'
  })

  it('returns a text response for a plain question', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockMessagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'You have 3 open tasks this week.' }],
    })
    const result = await sendAgentMessage([], 'What tasks do I have?')
    expect(result.content).toBe('You have 3 open tasks this week.')
    expect(result.navigateTo).toBeUndefined()
  })

  it('executes tool calls and returns final response', async () => {
    setupMocks({
      user_profiles: { data: MOCK_PROFILE, error: null },
      tasks: { data: [{ title: 'Fix auth bug', status: 'todo', priority: 'high', due_date: null, entities: null }], error: null },
      projects: { data: [], error: null },
      captures: { data: [], error: null },
    })
    mockMessagesCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'get_workspace_summary', input: {} },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Here is your workspace summary.' }],
      })
    const result = await sendAgentMessage([], 'Give me a workspace overview')
    expect(result.content).toBe('Here is your workspace summary.')
    expect(mockMessagesCreate).toHaveBeenCalledTimes(2)
  })

  it('returns navigateTo when navigate_to tool is called', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockMessagesCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'tool_use', id: 'tool-1', name: 'navigate_to', input: { page: 'tasks' } },
        ],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Taking you to your tasks.' }],
      })
    const result = await sendAgentMessage([], 'Take me to my tasks')
    expect(result.navigateTo).toBe('/dashboard/tasks')
    expect(result.content).toBe('Taking you to your tasks.')
  })

  it('maintains conversation history across turns', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockMessagesCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Got it, continuing our conversation.' }],
    })
    const history = [
      { role: 'user' as const, content: 'What projects do I have?' },
      { role: 'assistant' as const, content: 'You have 2 active projects.' },
    ]
    await sendAgentMessage(history, 'What about tasks?')
    const callArgs = mockMessagesCreate.mock.calls[0][0]
    expect(callArgs.messages.length).toBe(3) // 2 history + 1 new
  })

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(sendAgentMessage([], 'hello')).rejects.toThrow('ANTHROPIC_API_KEY')
  })

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(sendAgentMessage([], 'hello')).rejects.toThrow('Not authenticated')
  })

  it('read_knowledge_entry returns body for non-vault entry', async () => {
    const entry = {
      id: 'e1', title: 'My doc', body: 'The full body text.', summary: 's',
      kind: 'doc', entity: 'sf', tags: ['x'], access: 'standard', user_id: 'someone-else', status: 'active',
    }
    setupMocks({
      user_profiles: { data: MOCK_PROFILE, error: null },
      knowledge_entries: { data: entry, error: null },
    })
    // Make .maybeSingle work too
    mockFrom.mockImplementation((table: string) => {
      const chain = makeChain({ data: table === 'knowledge_entries' ? entry : MOCK_PROFILE, error: null })
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: table === 'knowledge_entries' ? entry : MOCK_PROFILE, error: null })
      return chain
    })

    let toolResult = ''
    mockMessagesCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'read_knowledge_entry', input: { entry_id: 'e1' } }],
      })
      .mockImplementationOnce(async (args: any) => {
        const lastUser = args.messages[args.messages.length - 1]
        toolResult = lastUser.content[0].content
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'OK' }] }
      })

    await sendAgentMessage([], 'read entry e1')
    expect(toolResult).toContain('The full body text.')
    expect(toolResult).toContain('My doc')
  })

  it('read_knowledge_entry refuses vault entry not owned by user', async () => {
    const entry = {
      id: 'v1', title: 'Vault doc', body: 'secret', summary: null,
      kind: 'doc', entity: 'sf', tags: [], access: 'vault', user_id: 'other-user', status: 'active',
    }
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockFrom.mockImplementation((table: string) => {
      const chain = makeChain({ data: table === 'knowledge_entries' ? entry : MOCK_PROFILE, error: null })
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: table === 'knowledge_entries' ? entry : MOCK_PROFILE, error: null })
      return chain
    })

    let toolResult = ''
    mockMessagesCreate
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'read_knowledge_entry', input: { entry_id: 'v1' } }],
      })
      .mockImplementationOnce(async (args: any) => {
        toolResult = args.messages[args.messages.length - 1].content[0].content
        return { stop_reason: 'end_turn', content: [{ type: 'text', text: 'noted' }] }
      })

    await sendAgentMessage([], 'read v1')
    expect(toolResult).toMatch(/vault/i)
    expect(toolResult).not.toContain('secret')
  })

  it('caps the agentic loop at 5 rounds', async () => {
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    // Always returns tool_use to trigger the loop cap
    mockMessagesCreate.mockResolvedValue({
      stop_reason: 'tool_use',
      content: [
        { type: 'tool_use', id: 'tool-1', name: 'get_workspace_summary', input: {} },
      ],
    })
    // Set up table mocks for workspace summary
    mockFrom.mockImplementation((table: string) => {
      if (table === 'user_profiles') return makeChain({ data: MOCK_PROFILE, error: null })
      return makeChain({ data: [], error: null })
    })
    const result = await sendAgentMessage([], 'loop test')
    expect(mockMessagesCreate).toHaveBeenCalledTimes(5)
    expect(result.content).toBe('I ran into an issue processing that. Please try again.')
  })
})

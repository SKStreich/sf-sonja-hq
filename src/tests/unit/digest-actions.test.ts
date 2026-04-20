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
  const methods = ['select', 'eq', 'lt', 'not', 'order', 'limit', 'single', 'or']
  methods.forEach(m => { chain[m] = vi.fn(() => chain) })
  chain.single = vi.fn().mockResolvedValue(response)
  // Make the chain itself thenable so await chain resolves
  chain.then = (resolve: any) => Promise.resolve(response).then(resolve)
  return chain
}

function setupMocks(overrides: { tasks?: any; projects?: any; captures?: any; user_profiles?: any } = {}) {
  mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
  mockFrom.mockImplementation((table: string) => {
    const resp = overrides[table as keyof typeof overrides] ?? { data: [], error: null, count: 0 }
    return makeChain(resp)
  })
}

import { getInsights, getDailyDigest, askAnything } from '@/app/api/digest/actions'

describe('getInsights', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns zeroed insight data when tables are empty', async () => {
    setupMocks({
      user_profiles: { data: MOCK_PROFILE, error: null },
    })
    const result = await getInsights()
    expect(result.overdueTaskCount).toBe(0)
    expect(result.stalledProjects).toEqual([])
    expect(result.unreviewedCaptureCount).toBe(0)
    expect(result.todayTaskCount).toBe(0)
  })

  it('identifies stalled projects with no next action', async () => {
    setupMocks({
      user_profiles: { data: MOCK_PROFILE, error: null },
      projects: {
        data: [
          { id: 'p1', name: 'Project Alpha', next_action: null, entities: { name: 'SF', type: 'sf' } },
          { id: 'p2', name: 'Project Beta', next_action: '', entities: null },
          { id: 'p3', name: 'Project Gamma', next_action: 'Write tests', entities: null },
        ],
        error: null,
      },
    })
    const result = await getInsights()
    expect(result.stalledProjects).toHaveLength(2)
    expect(result.stalledProjects.map(p => p.name)).toContain('Project Alpha')
    expect(result.stalledProjects.map(p => p.name)).toContain('Project Beta')
    expect(result.stalledProjects.map(p => p.name)).not.toContain('Project Gamma')
  })

  it('includes entity name on stalled projects', async () => {
    setupMocks({
      user_profiles: { data: MOCK_PROFILE, error: null },
      projects: {
        data: [
          { id: 'p1', name: 'Stalled Project', next_action: null, entities: [{ name: 'Triplemeter', type: 'tm' }] },
        ],
        error: null,
      },
    })
    const result = await getInsights()
    expect(result.stalledProjects[0].entity_name).toBe('Triplemeter')
  })

  it('throws when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    await expect(getInsights()).rejects.toThrow('Not authenticated')
  })
})

describe('getDailyDigest', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns parsed digest from Claude response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    const fakeDigest = {
      brief: 'You have 3 overdue tasks and 2 stalled projects.',
      top_priorities: ['Fix auth bug', 'Set next action on Project Alpha'],
      watch_items: ['Project Beta has no next action'],
      recommendation: 'Start with the auth bug — it blocks everything else.',
    }
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(fakeDigest) }],
    })
    const result = await getDailyDigest()
    expect(result.brief).toBe(fakeDigest.brief)
    expect(result.top_priorities).toHaveLength(2)
    expect(result.watch_items).toHaveLength(1)
    expect(result.recommendation).toContain('auth bug')
  })

  it('handles JSON wrapped in markdown code fences', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    const fakeDigest = {
      brief: 'Clean workspace.',
      top_priorities: ['Keep it up'],
      watch_items: [],
      recommendation: 'Maintain momentum.',
    }
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '```json\n' + JSON.stringify(fakeDigest) + '\n```' }],
    })
    const result = await getDailyDigest()
    expect(result.brief).toBe('Clean workspace.')
  })

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(getDailyDigest()).rejects.toThrow('ANTHROPIC_API_KEY')
  })

  it('throws when Claude returns invalid JSON', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'not valid json' }],
    })
    await expect(getDailyDigest()).rejects.toThrow('Failed to parse AI response')
  })

  it('provides safe defaults for missing fields', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: '{}' }],
    })
    const result = await getDailyDigest()
    expect(result.brief).toBe('')
    expect(result.top_priorities).toEqual([])
    expect(result.watch_items).toEqual([])
    expect(result.recommendation).toBe('')
  })
})

describe('askAnything', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('returns answer from Claude', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    setupMocks({ user_profiles: { data: MOCK_PROFILE, error: null } })
    mockMessagesCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'Focus on the auth sprint this week.' }],
    })
    const result = await askAnything('What should I focus on this week?')
    expect(result).toBe('Focus on the auth sprint this week.')
  })

  it('throws when question is empty', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    await expect(askAnything('   ')).rejects.toThrow('Question is required')
  })

  it('throws when ANTHROPIC_API_KEY is not set', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(askAnything('any question')).rejects.toThrow('ANTHROPIC_API_KEY')
  })
})

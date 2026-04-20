import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockUpsert = vi.fn().mockResolvedValue({ error: null })
const mockInsert = vi.fn().mockResolvedValue({ error: null })
const mockFrom = vi.fn(() => ({ insert: mockInsert, upsert: mockUpsert }))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({ from: mockFrom })),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1' }, error: null }),
        }),
      }),
    })),
  })),
}))

// ── Mock fetch ────────────────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// ── Import under test ─────────────────────────────────────────────────────────

import { logAnthropicCall, syncResendUsage, syncVercelUsage, syncNetlifyUsage } from '@/app/api/usage/actions'

beforeEach(() => {
  vi.clearAllMocks()
  mockUpsert.mockResolvedValue({ error: null })
  mockInsert.mockResolvedValue({ error: null })
  mockFrom.mockReturnValue({ insert: mockInsert, upsert: mockUpsert })
})

// ── logAnthropicCall ──────────────────────────────────────────────────────────

describe('logAnthropicCall()', () => {
  it('inserts a usage record with correct cost calculation', async () => {
    await logAnthropicCall('org-1', 1_000_000, 1_000_000)
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      service: 'anthropic',
      metric_type: 'api_call',
      // $3/M input + $15/M output = $18 for 1M each
      cost_usd: 18,
    }))
  })

  it('enforces a minimum cost of $0.0001', async () => {
    await logAnthropicCall('org-1', 1, 1)
    const call = mockInsert.mock.calls[0][0]
    expect(call.cost_usd).toBeGreaterThanOrEqual(0.0001)
  })

  it('stores token counts in raw_data', async () => {
    await logAnthropicCall('org-1', 500, 200)
    expect(mockInsert).toHaveBeenCalledWith(expect.objectContaining({
      raw_data: { input_tokens: 500, output_tokens: 200 },
    }))
  })
})

// ── syncResendUsage ───────────────────────────────────────────────────────────

describe('syncResendUsage()', () => {
  it('returns error when RESEND_API_KEY is not set', async () => {
    const originalKey = process.env.RESEND_API_KEY
    delete process.env.RESEND_API_KEY
    const result = await syncResendUsage()
    expect(result.error).toMatch(/RESEND_API_KEY/)
    process.env.RESEND_API_KEY = originalKey
  })

  it('syncs email records grouped by day', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { id: '1', created_at: '2026-04-18T10:00:00Z' },
          { id: '2', created_at: '2026-04-18T14:00:00Z' },
          { id: '3', created_at: '2026-04-17T09:00:00Z' },
        ],
      }),
    })

    const result = await syncResendUsage()
    expect(result.error).toBeNull()
    expect(result.synced).toBe(2) // 2 unique days
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'resend', metric_type: 'emails_sent' }),
      expect.any(Object)
    )
  })

  it('returns error on Resend API failure', async () => {
    process.env.RESEND_API_KEY = 're_test_key'
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 })
    const result = await syncResendUsage()
    expect(result.error).toMatch(/401/)
  })
})

// ── syncVercelUsage ───────────────────────────────────────────────────────────

describe('syncVercelUsage()', () => {
  it('returns error when VERCEL_TOKEN is not set', async () => {
    delete process.env.VERCEL_TOKEN
    const result = await syncVercelUsage()
    expect(result.error).toMatch(/VERCEL_TOKEN/)
  })

  it('upserts subscription + deployment records', async () => {
    process.env.VERCEL_TOKEN = 'vt_test'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        deployments: [
          { createdAt: new Date('2026-04-18').getTime() },
          { createdAt: new Date('2026-04-18').getTime() },
          { createdAt: new Date('2026-04-17').getTime() },
        ],
      }),
    })

    const result = await syncVercelUsage()
    expect(result.error).toBeNull()
    // subscription (1) + 2 unique days = 3
    expect(result.synced).toBe(3)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'vercel', metric_type: 'subscription', cost_usd: 20 }),
      expect.any(Object)
    )
  })
})

// ── syncNetlifyUsage ──────────────────────────────────────────────────────────

describe('syncNetlifyUsage()', () => {
  it('returns error when NETLIFY_AUTH_TOKEN is not set', async () => {
    delete process.env.NETLIFY_AUTH_TOKEN
    const result = await syncNetlifyUsage()
    expect(result.error).toMatch(/NETLIFY_AUTH_TOKEN/)
  })

  it('returns error when NETLIFY_ACCOUNT_SLUG is not set', async () => {
    process.env.NETLIFY_AUTH_TOKEN = 'nt_test'
    delete process.env.NETLIFY_ACCOUNT_SLUG
    const result = await syncNetlifyUsage()
    expect(result.error).toMatch(/NETLIFY_ACCOUNT_SLUG/)
  })

  it('upserts subscription + build records', async () => {
    process.env.NETLIFY_AUTH_TOKEN = 'nt_test'
    process.env.NETLIFY_ACCOUNT_SLUG = 'sonja-hq'
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ([
        { created_at: '2026-04-18T10:00:00Z', deploy_time: 120 },
        { created_at: '2026-04-18T11:00:00Z', deploy_time: 90 },
      ]),
    })

    const result = await syncNetlifyUsage()
    expect(result.error).toBeNull()
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'netlify', metric_type: 'subscription', cost_usd: 19 }),
      expect.any(Object)
    )
  })
})

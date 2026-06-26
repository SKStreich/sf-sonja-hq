/** Granola client foundation (Sprint 13) — key reader + REST client. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  getGranolaApiKey, isGranolaConfigured, granolaFetch, listGranolaNotes, GRANOLA_API_BASE,
  extractGranolaSummary,
} from '@/lib/integrations/granola'

describe('getGranolaApiKey', () => {
  const prev = process.env.GRANOLA_API_KEY
  afterEach(() => { process.env.GRANOLA_API_KEY = prev })
  it('reads the env var and reports configured state', () => {
    process.env.GRANOLA_API_KEY = 'grn_test'
    expect(getGranolaApiKey()).toBe('grn_test')
    expect(isGranolaConfigured()).toBe(true)
  })
  it('is undefined / not configured when unset', () => {
    delete process.env.GRANOLA_API_KEY
    expect(getGranolaApiKey()).toBeUndefined()
    expect(isGranolaConfigured()).toBe(false)
  })
})

describe('granolaFetch', () => {
  let fetchMock: ReturnType<typeof vi.fn>
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
  })
  afterEach(() => vi.unstubAllGlobals())

  it('hits the right URL with the bearer header and skips empty params', async () => {
    await granolaFetch('/notes', 'grn_k', { created_after: '2026-01-01', cursor: undefined })
    const [url, opts] = fetchMock.mock.calls[0]
    expect(url).toBe(`${GRANOLA_API_BASE}/notes?created_after=2026-01-01`)
    expect(opts.headers.Authorization).toBe('Bearer grn_k')
  })
})

describe('listGranolaNotes', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('normalizes notes + pagination flags', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ notes: [{ id: 1, title: 'Standup', updated_at: 't' }], hasMore: true, cursor: 'c1' }),
    }))
    const page = await listGranolaNotes({ key: 'grn_k' })
    expect(page.notes).toEqual([{ id: '1', title: 'Standup', created_at: null, updated_at: 't' }])
    expect(page.hasMore).toBe(true)
    expect(page.cursor).toBe('c1')
  })
  it('throws with the status on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))
    await expect(listGranolaNotes({ key: 'bad' })).rejects.toThrow('Granola API 401')
  })
})

describe('extractGranolaSummary', () => {
  it('prefers the first present string field in order', () => {
    expect(extractGranolaSummary({ summary: 'S', ai_summary: 'A' })).toBe('S')
    expect(extractGranolaSummary({ ai_summary: 'A', overview: 'O' })).toBe('A')
    expect(extractGranolaSummary({ overview: 'O' })).toBe('O')
  })
  it('trims and skips empty/whitespace strings', () => {
    expect(extractGranolaSummary({ summary: '   ', overview: 'O' })).toBe('O')
    expect(extractGranolaSummary({ summary: '  hi  ' })).toBe('hi')
  })
  it('reads nested { summary: { text|markdown } } shapes', () => {
    expect(extractGranolaSummary({ summary: { text: 'T' } })).toBe('T')
    expect(extractGranolaSummary({ summary: { markdown: 'M' } })).toBe('M')
  })
  it('returns null when no summary text is present', () => {
    expect(extractGranolaSummary({ title: 'x' })).toBeNull()
    expect(extractGranolaSummary(null)).toBeNull()
    expect(extractGranolaSummary('nope')).toBeNull()
  })
})

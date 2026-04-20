import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const mockFrom = vi.fn(() => ({
  update: mockUpdate,
  select: vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1' }, error: null }),
    }),
  }),
}))

const mockUser = { id: 'user-1', email: 'sonja@test.com' }

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: mockFrom,
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

vi.mock('@/app/api/documents/actions', () => ({
  syncNotionPages: vi.fn().mockResolvedValue(undefined),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

import { fetchGitHubCommits, saveGitHubUrl } from '@/app/api/integrations/actions'

beforeEach(() => {
  vi.clearAllMocks()
  mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
})

describe('fetchGitHubCommits()', () => {
  it('returns empty array for an invalid URL', async () => {
    const result = await fetchGitHubCommits('not-a-github-url')
    expect(result).toEqual([])
  })

  it('parses github.com/owner/repo URL correctly', async () => {
    const mockCommits = [
      {
        sha: 'abc1234567890',
        commit: { message: 'Fix bug\n\nDetails', author: { name: 'Sonja', date: '2026-04-01T00:00:00Z' } },
        html_url: 'https://github.com/owner/repo/commit/abc1234567890',
      },
    ]
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockCommits),
    }) as any

    const result = await fetchGitHubCommits('https://github.com/owner/repo', 5)
    expect(result).toHaveLength(1)
    expect(result[0].sha).toBe('abc1234')
    expect(result[0].message).toBe('Fix bug')
    expect(result[0].author).toBe('Sonja')
  })

  it('strips .git suffix from repo name', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as any
    await fetchGitHubCommits('https://github.com/owner/my-repo.git', 5)
    expect((global.fetch as any).mock.calls[0][0]).toContain('/repos/owner/my-repo/commits')
  })

  it('returns empty array when GitHub API returns non-ok response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as any
    const result = await fetchGitHubCommits('https://github.com/owner/repo')
    expect(result).toEqual([])
  })

  it('returns empty array when fetch throws', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error')) as any
    const result = await fetchGitHubCommits('https://github.com/owner/repo')
    expect(result).toEqual([])
  })
})

describe('saveGitHubUrl()', () => {
  it('updates the project github_url', async () => {
    await saveGitHubUrl('project-1', 'https://github.com/owner/repo')
    expect(mockFrom).toHaveBeenCalledWith('projects')
    expect(mockUpdate).toHaveBeenCalledWith({ github_url: 'https://github.com/owner/repo' })
  })

  it('throws when unauthenticated', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    vi.mocked(createClient).mockReturnValueOnce({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
      from: mockFrom,
    } as any)
    await expect(saveGitHubUrl('project-1', 'https://github.com/x/y')).rejects.toThrow('Not authenticated')
  })

  it('throws when DB update fails', async () => {
    mockUpdate.mockReturnValueOnce({ eq: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }) })
    await expect(saveGitHubUrl('project-1', 'https://github.com/x/y')).rejects.toThrow('Failed to save GitHub URL')
  })
})

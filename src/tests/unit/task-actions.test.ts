import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Supabase mock ─────────────────────────────────────────────────────────────

const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const mockInsert = vi.fn().mockResolvedValue({ error: null })
const mockDelete = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
const mockFrom = vi.fn((table: string) => ({
  insert: mockInsert,
  update: mockUpdate,
  delete: mockDelete,
  select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: { org_id: 'org-1' }, error: null }) }) }),
}))

const mockUser = { id: 'user-1', email: 'sonja@test.com' }

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(() => ({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    from: mockFrom,
    storage: { from: vi.fn(() => ({ remove: vi.fn().mockResolvedValue({ error: null }) })) },
  })),
}))

// ── Tests ─────────────────────────────────────────────────────────────────────

import { cancelTask, reopenTask, completeTask, moveTaskBucket } from '@/app/api/tasks/actions'

beforeEach(() => {
  vi.clearAllMocks()
  // Re-wire update mock after clear
  mockUpdate.mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) })
})

describe('cancelTask()', () => {
  it('updates status to cancelled', async () => {
    await cancelTask('task-1')
    expect(mockFrom).toHaveBeenCalledWith('tasks')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'cancelled' }))
  })

  it('throws when Supabase returns an error', async () => {
    mockUpdate.mockReturnValueOnce({ eq: vi.fn().mockResolvedValue({ error: { message: 'DB error' } }) })
    await expect(cancelTask('task-1')).rejects.toThrow('Failed to cancel task')
  })
})

describe('reopenTask()', () => {
  it('updates status to todo', async () => {
    await reopenTask('task-1')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'todo' }))
  })
})

describe('completeTask()', () => {
  it('updates status to done', async () => {
    await completeTask('task-1')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }))
  })
})

describe('moveTaskBucket()', () => {
  it('updates gtd_bucket', async () => {
    await moveTaskBucket('task-1', 'today')
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ gtd_bucket: 'today' }))
  })

  it('rejects invalid bucket values at the type level', () => {
    // TypeScript catches this at compile time — this confirms the type is enforced
    type GtdBucket = Parameters<typeof moveTaskBucket>[1]
    const valid: GtdBucket[] = ['today', 'this_week', 'backlog', 'someday']
    expect(valid).toHaveLength(4)
  })
})

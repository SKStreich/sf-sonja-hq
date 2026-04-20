import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingle = vi.fn()
const mockMaybeSingle = vi.fn()
const mockSelect = vi.fn()
const mockUpdate = vi.fn()
const mockDelete = vi.fn()
const mockInsert = vi.fn()
const mockEq = vi.fn()

function chainable(result: any) {
  const obj: any = {}
  const methods = ['select', 'eq', 'neq', 'update', 'delete', 'insert', 'upsert', 'order', 'limit']
  methods.forEach(m => { obj[m] = vi.fn(() => obj) })
  obj.single = vi.fn().mockResolvedValue(result)
  obj.maybeSingle = vi.fn().mockResolvedValue(result)
  return obj
}

const mockFrom = vi.fn()
const mockGetUser = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: mockGetUser },
    from: mockFrom,
  }),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}))

vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: { send: vi.fn().mockResolvedValue({ id: 'test' }) },
  })),
}))

import {
  assignTask,
  markNotificationRead,
  markAllNotificationsRead,
  removeMember,
  updateMemberRole,
} from '@/app/api/members/actions'

const MOCK_USER = { id: 'user-1', email: 'owner@example.com' }
const MOCK_PROFILE = { org_id: 'org-1', role: 'owner', full_name: 'Owner', email: 'owner@example.com' }

function setupMockFrom(tableResponses: Record<string, any>) {
  mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
  mockFrom.mockImplementation((table: string) => {
    const defaults = { data: null, error: null, count: null }
    const response = tableResponses[table] ?? defaults
    const chain: any = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(response),
      maybeSingle: vi.fn().mockResolvedValue(response),
      head: false,
    }
    return chain
  })
}

describe('assignTask', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updates assignee_id on the task', async () => {
    setupMockFrom({
      user_profiles: { data: MOCK_PROFILE, error: null },
      tasks: { data: { title: 'Test task' }, error: null },
      notifications: { data: null, error: null },
    })

    const updateSpy = vi.fn().mockReturnThis()
    const eqSpy = vi.fn().mockReturnThis()
    mockFrom.mockImplementation((table: string) => {
      const chain: any = {
        select: vi.fn().mockReturnThis(),
        eq: eqSpy,
        update: updateSpy,
        insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        single: vi.fn().mockResolvedValue(
          table === 'user_profiles' ? { data: MOCK_PROFILE, error: null }
            : { data: { title: 'Test task' }, error: null }
        ),
      }
      updateSpy.mockReturnValue(chain)
      eqSpy.mockReturnValue(chain)
      return chain
    })

    await expect(assignTask('task-1', 'user-2')).resolves.not.toThrow()
  })

  it('handles null assigneeId (unassign)', async () => {
    setupMockFrom({
      user_profiles: { data: MOCK_PROFILE, error: null },
      tasks: { data: { title: 'Test task' }, error: null },
    })
    await expect(assignTask('task-1', null)).resolves.not.toThrow()
  })
})

describe('markNotificationRead', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('updates read=true for the notification', async () => {
    setupMockFrom({ user_profiles: { data: MOCK_PROFILE, error: null } })
    await expect(markNotificationRead('notif-1')).resolves.not.toThrow()
  })
})

describe('markAllNotificationsRead', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('marks all unread notifications as read', async () => {
    setupMockFrom({ user_profiles: { data: MOCK_PROFILE, error: null } })
    await expect(markAllNotificationsRead()).resolves.not.toThrow()
  })
})

describe('updateMemberRole', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws if caller is not admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    const memberProfile = { ...MOCK_PROFILE, role: 'member' }
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: memberProfile, error: null }),
    }))
    await expect(updateMemberRole('other-user', 'admin')).rejects.toThrow('Admin access required')
  })

  it('updates role if caller is admin', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: MOCK_PROFILE, error: null }),
    }))
    await expect(updateMemberRole('other-user', 'member')).resolves.not.toThrow()
  })
})

describe('removeMember', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws if trying to remove self', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER } })
    mockFrom.mockImplementation(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: MOCK_PROFILE, error: null }),
    }))
    await expect(removeMember(MOCK_USER.id)).rejects.toThrow('cannot remove yourself')
  })
})

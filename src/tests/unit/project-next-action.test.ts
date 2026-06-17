import { describe, it, expect, vi } from 'vitest'
import { computeProgress } from '@/lib/projects/progress'
import { refreshNextAction } from '@/lib/projects/next-action'

describe('computeProgress()', () => {
  it('reports 0% / total 0 when there are no tasks', () => {
    expect(computeProgress([])).toEqual({ done: 0, total: 0, pct: 0 })
  })

  it('excludes cancelled tasks from the denominator', () => {
    const p = computeProgress([
      { status: 'done' }, { status: 'todo' }, { status: 'cancelled' },
    ])
    // 1 done of 2 counted (cancelled ignored) = 50%
    expect(p).toEqual({ done: 1, total: 2, pct: 50 })
  })

  it('rounds to a whole percent', () => {
    const p = computeProgress([{ status: 'done' }, { status: 'todo' }, { status: 'todo' }])
    expect(p.pct).toBe(33)
  })

  it('reports 100% when every counted task is done', () => {
    expect(computeProgress([{ status: 'done' }, { status: 'done' }]).pct).toBe(100)
  })
})

// ── refreshNextAction() ────────────────────────────────────────────────────────

/**
 * Build a minimal supabase mock:
 *  - projects.select(...).eq(...).single() → { next_task_id }
 *  - tasks.select(...).eq(...).eq(...).not(...) → { data: openTasks }
 *  - projects.update(patch).eq(...) → captures patch
 */
function mockClient(nextTaskId: string | null, openTasks: any[]) {
  const captured: { patch?: any } = {}
  const supabase = {
    from(table: string) {
      if (table === 'projects') {
        return {
          select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: { next_task_id: nextTaskId } }) }) }),
          update: (patch: any) => { captured.patch = patch; return { eq: () => Promise.resolve({ error: null }) } },
        }
      }
      // tasks
      return {
        select: () => ({ eq: () => ({ eq: () => ({ not: () => Promise.resolve({ data: openTasks }) }) }) }),
      }
    },
  }
  return { supabase, captured }
}

describe('refreshNextAction()', () => {
  it('clears the next action when no tasks are open', async () => {
    const { supabase, captured } = mockClient('task-1', [])
    await refreshNextAction(supabase, 'proj-1')
    expect(captured.patch).toEqual({ next_task_id: null, next_action: null, next_action_type: null, next_action_due: null })
  })

  it('keeps the pinned task as the head while it is still open', async () => {
    const open = [
      { id: 'task-1', title: 'Pinned', action_type: 'review', due_date: '2026-07-01', sort_order: 0, created_at: 'a' },
      { id: 'task-2', title: 'Earlier due', action_type: null, due_date: '2026-06-01', sort_order: 0, created_at: 'b' },
    ]
    const { supabase, captured } = mockClient('task-1', open)
    await refreshNextAction(supabase, 'proj-1')
    expect(captured.patch.next_task_id).toBe('task-1')
    expect(captured.patch.next_action).toBe('Pinned')
    expect(captured.patch.next_action_type).toBe('review')
  })

  it('falls back to the earliest-due open task when the pin is gone', async () => {
    const open = [
      { id: 'task-2', title: 'Later', action_type: null, due_date: '2026-08-01', sort_order: 0, created_at: 'b' },
      { id: 'task-3', title: 'Soonest', action_type: 'call', due_date: '2026-06-15', sort_order: 0, created_at: 'c' },
    ]
    // pinned task-1 no longer in the open set
    const { supabase, captured } = mockClient('task-1', open)
    await refreshNextAction(supabase, 'proj-1')
    expect(captured.patch.next_task_id).toBe('task-3')
    expect(captured.patch.next_action).toBe('Soonest')
  })
})

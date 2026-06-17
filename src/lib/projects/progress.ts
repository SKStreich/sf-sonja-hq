// Project completion = done tasks ÷ total tasks, excluding cancelled tasks.
// A project with no (non-cancelled) tasks reports 0% and total 0.

export interface TaskProgress {
  done: number
  /** Count of non-cancelled tasks (the denominator). */
  total: number
  /** Whole-number percentage (0–100). 0 when there are no countable tasks. */
  pct: number
}

export function computeProgress(tasks: { status: string }[]): TaskProgress {
  const counted = tasks.filter((t) => t.status !== 'cancelled')
  const total = counted.length
  const done = counted.filter((t) => t.status === 'done').length
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return { done, total, pct }
}

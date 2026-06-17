// The project's "next action" is a real, completable task — the one pinned first
// in the task list. `projects.next_task_id` points at it, and the next_action*
// columns are a denormalized cache of that task (title / action_type / due_date)
// so the dashboard, project cards, and list view keep reading columns unchanged.
//
// `refreshNextAction` is the single source of truth for keeping all of that in
// sync. It is idempotent and self-healing — call it after ANY task mutation:
//   - the pinned task is preserved as the head while it stays open (so editing
//     it just re-syncs the cached columns),
//   - if the pinned task is completed / cancelled / deleted, the earliest-due
//     remaining open task becomes the new head,
//   - if nothing is open, the next-action is cleared.

type AnyClient = any

interface OpenTask {
  id: string
  title: string
  action_type: string | null
  due_date: string | null
  sort_order: number | null
  created_at: string
}

/** Earliest due date first (nulls last), then sort_order, then creation order. */
function byDueThenOrder(a: OpenTask, b: OpenTask): number {
  const ad = a.due_date ?? '9999-12-31'
  const bd = b.due_date ?? '9999-12-31'
  if (ad !== bd) return ad < bd ? -1 : 1
  const ao = a.sort_order ?? 0
  const bo = b.sort_order ?? 0
  if (ao !== bo) return ao - bo
  return (a.created_at ?? '') < (b.created_at ?? '') ? -1 : 1
}

export async function refreshNextAction(supabase: AnyClient, projectId: string): Promise<void> {
  const { data: proj } = await supabase
    .from('projects')
    .select('next_task_id')
    .eq('id', projectId)
    .single()

  const { data: openTasks } = await supabase
    .from('tasks')
    .select('id,title,action_type,due_date,sort_order,created_at')
    .eq('project_id', projectId)
    .eq('archived', false)
    .not('status', 'in', '("done","cancelled")')

  const open = (openTasks ?? []) as OpenTask[]
  const pinnedId: string | null = proj?.next_task_id ?? null

  // Keep the explicitly-pinned task as the head while it's still open; otherwise
  // fall back to the earliest-due open task.
  let head: OpenTask | null = pinnedId ? open.find((t) => t.id === pinnedId) ?? null : null
  if (!head) head = [...open].sort(byDueThenOrder)[0] ?? null

  await supabase
    .from('projects')
    .update({
      next_task_id: head?.id ?? null,
      next_action: head?.title ?? null,
      next_action_type: head?.action_type ?? null,
      next_action_due: head?.due_date ?? null,
    })
    .eq('id', projectId)
}

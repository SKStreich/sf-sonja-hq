import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do', in_progress: 'In Progress', done: 'Done', parked: 'Parked',
}
const STATUS_COLORS: Record<string, string> = {
  todo: 'text-gray-400', in_progress: 'text-indigo-400', done: 'text-green-400', parked: 'text-yellow-500',
}

export default async function AllTasksPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tasks } = await (supabase as any)
    .from('tasks')
    .select('*, projects(id, name)')
    .eq('archived', false)
    .order('created_at', { ascending: false })

  const grouped: Record<string, typeof tasks> = {
    todo: [], in_progress: [], done: [], parked: [],
  }
  for (const t of tasks ?? []) {
    if (grouped[t.status]) grouped[t.status]!.push(t)
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs uppercase tracking-wider text-gray-600 hover:text-gray-400 transition-colors">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">All Tasks</h1>
        <p className="mt-0.5 text-sm text-gray-500">{tasks?.length ?? 0} open task{tasks?.length !== 1 ? 's' : ''} across all projects</p>
      </div>

      {['todo', 'in_progress', 'done', 'parked'].map(status => {
        const group = grouped[status] ?? []
        if (!group.length) return null
        return (
          <div key={status} className="mb-6">
            <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-600">
              {STATUS_LABELS[status]} · {group.length}
            </h2>
            <div className="rounded-xl border border-gray-800 overflow-hidden">
              {(group as any[]).map((t: any, i: number) => (
                <Link
                  key={t.id}
                  href={`/dashboard/projects/${t.project_id}`}
                  className={`flex items-center gap-4 px-4 py-3 hover:bg-gray-900/40 transition-colors ${
                    i < group.length - 1 ? 'border-b border-gray-800/50' : ''
                  }`}
                >
                  <span className={`text-xs font-medium w-20 shrink-0 ${STATUS_COLORS[status]}`}>
                    {STATUS_LABELS[status]}
                  </span>
                  <span className="flex-1 text-sm text-white truncate">{t.title}</span>
                  <span className="text-xs text-gray-600 shrink-0 truncate max-w-[160px]">
                    {(t as any).projects?.name ?? ''}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )
      })}

      {(!tasks || tasks.length === 0) && (
        <div className="rounded-2xl border border-dashed border-gray-800 py-20 text-center">
          <p className="text-gray-500">No open tasks</p>
        </div>
      )}
    </div>
  )
}

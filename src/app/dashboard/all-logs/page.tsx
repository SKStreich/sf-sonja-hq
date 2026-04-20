import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const TYPE_COLORS: Record<string, string> = {
  note: 'bg-gray-600',
  progress: 'bg-green-600',
  blocker: 'bg-red-600',
  decision: 'bg-indigo-600',
  milestone: 'bg-yellow-500',
}

function formatDate(ts: string): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

export default async function AllLogsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: updates } = await (supabase as any)
    .from('project_updates')
    .select('*, projects(id, name)')
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs uppercase tracking-wider text-gray-600 hover:text-gray-400 transition-colors">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">All Log Entries</h1>
        <p className="mt-0.5 text-sm text-gray-500">{updates?.length ?? 0} entr{updates?.length !== 1 ? 'ies' : 'y'} across all projects</p>
      </div>

      {updates && updates.length > 0 ? (
        <div className="space-y-1">
          {updates.map((u: any) => (
            <Link
              key={u.id}
              href={`/dashboard/projects/${u.project_id}`}
              className="flex items-start gap-4 rounded-lg border border-gray-800/50 bg-gray-900/30 px-4 py-3 hover:bg-gray-900/60 transition-colors"
            >
              <div className="mt-1.5 shrink-0 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${TYPE_COLORS[u.update_type] ?? 'bg-gray-600'}`} />
                <span className="text-xs font-medium uppercase tracking-wider text-gray-600 w-16">{u.update_type}</span>
              </div>
              <p className="flex-1 text-sm text-gray-300 line-clamp-2">{u.content}</p>
              <div className="shrink-0 text-right hidden sm:block">
                <p className="text-xs text-indigo-400 hover:text-indigo-300">{u.projects?.name ?? '—'}</p>
                <p className="text-xs text-gray-600 mt-0.5">{formatDate(u.created_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-gray-800 py-20 text-center">
          <p className="text-gray-500">No log entries yet</p>
        </div>
      )}
    </div>
  )
}

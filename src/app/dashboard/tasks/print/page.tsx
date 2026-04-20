import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PrintButton } from '@/components/print/PrintButton'

const BUCKET_ORDER = ['today', 'this_week', 'backlog', 'someday']
const BUCKET_LABELS: Record<string, string> = { today: 'Today', this_week: 'This Week', backlog: 'Backlog', someday: 'Someday' }
const STATUS_LABELS: Record<string, string> = { todo: 'Open', in_progress: 'In Progress', done: 'Done', cancelled: 'Cancelled', parked: 'Parked' }

// print view
export default async function TasksPrintPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: tasks } = await (supabase as any)
    .from('tasks')
    .select('*, projects(name), entities(name)')
    .eq('archived', false)
    .order('due_date', { ascending: true, nullsFirst: false })

  const byBucket = (bucket: string) => (tasks ?? []).filter((t: any) => t.gtd_bucket === bucket)

  return (
    <div className="min-h-screen bg-white text-gray-900 p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8 print:hidden">
        <Link href="/dashboard/tasks" className="text-sm text-indigo-600 hover:underline">← Back to Tasks</Link>
        <PrintButton />
      </div>

      <h1 className="text-2xl font-bold mb-1">Tasks</h1>
      <p className="text-sm text-gray-500 mb-8">Printed {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>

      {BUCKET_ORDER.map(bucket => {
        const bucketTasks = byBucket(bucket)
        if (bucketTasks.length === 0) return null
        return (
          <div key={bucket} className="mb-8">
            <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-3">{BUCKET_LABELS[bucket]}</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                  <th className="pb-1 pr-4 font-medium">Task</th>
                  <th className="pb-1 pr-4 font-medium w-24">Status</th>
                  <th className="pb-1 pr-4 font-medium w-20">Priority</th>
                  <th className="pb-1 pr-4 font-medium w-32">Project</th>
                  <th className="pb-1 font-medium w-24">Due</th>
                </tr>
              </thead>
              <tbody>
                {bucketTasks.map((t: any) => (
                  <tr key={t.id} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium">{t.title}</td>
                    <td className="py-2 pr-4 text-gray-500 text-xs">{STATUS_LABELS[t.status] ?? t.status}</td>
                    <td className="py-2 pr-4 text-gray-500 text-xs capitalize">{t.priority}</td>
                    <td className="py-2 pr-4 text-gray-500 text-xs">{t.projects?.name ?? '—'}</td>
                    <td className="py-2 text-gray-500 text-xs">{t.due_date ? new Date(t.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

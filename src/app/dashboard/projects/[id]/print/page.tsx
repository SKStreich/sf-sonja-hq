import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { PrintButton } from '@/components/print/PrintButton'

export default async function ProjectPrintPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [projRes, tasksRes, updatesRes, filesRes] = await Promise.all([
    (supabase as any).from('projects').select('*, entities(name, type)').eq('id', params.id).single(),
    (supabase as any).from('tasks').select('*').eq('project_id', params.id).order('status').order('due_date'),
    (supabase as any).from('project_updates').select('*').eq('project_id', params.id).order('created_at', { ascending: false }),
    (supabase as any).from('project_files').select('*').eq('project_id', params.id).order('created_at', { ascending: false }),
  ])

  if (!projRes.data) notFound()
  const project = projRes.data
  const tasks = tasksRes.data ?? []
  const updates = updatesRes.data ?? []
  const files = filesRes.data ?? []

  const STATUS_LABELS: Record<string, string> = { todo: 'Open', in_progress: 'In Progress', done: 'Done', cancelled: 'Cancelled', parked: 'Parked' }

  return (
    <div className="min-h-screen bg-white text-gray-900 p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8 print:hidden">
        <Link href={`/dashboard/projects/${params.id}`} className="text-sm text-indigo-600 hover:underline">← Back to Project</Link>
        <PrintButton />
      </div>

      {/* Project header */}
      <div className="mb-8 pb-6 border-b border-gray-200">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">{project.entities?.name}</p>
            <h1 className="text-2xl font-bold">{project.name}</h1>
            {project.description && <p className="mt-2 text-gray-600">{project.description}</p>}
          </div>
          <div className="text-right text-sm text-gray-500">
            <p className="capitalize">{project.status?.replace('_', ' ')}</p>
            {project.phase && <p>{project.phase}</p>}
            {project.due_date && <p>Due {new Date(project.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>}
          </div>
        </div>
        {project.next_action && (
          <div className="mt-4 rounded-lg bg-gray-50 px-4 py-3">
            <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Next Action</p>
            <p className="text-sm font-medium mt-0.5">{project.next_action}</p>
            {project.next_action_due && <p className="text-xs text-gray-500 mt-0.5">Due {project.next_action_due}</p>}
          </div>
        )}
      </div>

      {/* Tasks */}
      {tasks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-3">Tasks ({tasks.length})</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                <th className="pb-1 pr-4 font-medium">Task</th>
                <th className="pb-1 pr-4 font-medium w-24">Status</th>
                <th className="pb-1 pr-4 font-medium w-20">Priority</th>
                <th className="pb-1 font-medium w-24">Due</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((t: any) => (
                <tr key={t.id} className="border-b border-gray-50">
                  <td className="py-2 pr-4 font-medium">{t.title}</td>
                  <td className="py-2 pr-4 text-gray-500 text-xs">{STATUS_LABELS[t.status] ?? t.status}</td>
                  <td className="py-2 pr-4 text-gray-500 text-xs capitalize">{t.priority}</td>
                  <td className="py-2 text-gray-500 text-xs">{t.due_date ? new Date(t.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Files */}
      {files.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-3">Files ({files.length})</h2>
          <div className="grid grid-cols-2 gap-2">
            {files.map((f: any) => (
              <div key={f.id} className="flex items-center gap-2 rounded border border-gray-100 px-3 py-2">
                <span>📄</span>
                <div>
                  <p className="text-sm font-medium">{f.filename}</p>
                  <p className="text-xs text-gray-400">{new Date(f.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log */}
      {updates.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold uppercase tracking-widest text-gray-500 border-b border-gray-200 pb-1 mb-3">Log ({updates.length})</h2>
          <div className="flex flex-col gap-3">
            {updates.map((u: any) => (
              <div key={u.id} className="border-l-2 border-gray-200 pl-4">
                <p className="text-sm">{u.content}</p>
                <p className="text-xs text-gray-400 mt-0.5">{new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 text-center mt-12 print:block">Printed {new Date().toLocaleDateString()}</p>
    </div>
  )
}

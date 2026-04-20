import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PrintButton } from '@/components/print/PrintButton'

const STATUS_LABELS: Record<string, string> = {
  planning: 'Planning', active: 'Active', on_hold: 'On Hold', complete: 'Complete',
}
const PRIORITY_LABELS: Record<string, string> = {
  high: 'High', medium: 'Medium', low: 'Low',
}
const ENTITY_LABELS: Record<string, string> = {
  tm: 'Triplemeter', sf: 'SF Solutions', sfe: 'SF Enterprises', personal: 'Personal',
}

// print view
export default async function ProjectsPrintPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: projects } = await supabase
    .from('projects')
    .select('*, entities(name, type)')
    .order('status')
    .order('name')

  const { data: tasks } = await (supabase as any)
    .from('tasks')
    .select('id, title, status, priority, due_date, project_id')
    .eq('archived', false)
    .order('status')

  const tasksByProject = (projectId: string) =>
    (tasks ?? []).filter((t: any) => t.project_id === projectId)

  const grouped = Object.entries(
    (projects ?? []).reduce((acc: Record<string, any[]>, p: any) => {
      const label = ENTITY_LABELS[p.entities?.type] ?? p.entities?.name ?? 'Other'
      if (!acc[label]) acc[label] = []
      acc[label].push(p)
      return acc
    }, {})
  ).sort(([a], [b]) => a.localeCompare(b))

  return (
    <div className="min-h-screen bg-white text-gray-900 p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8 print:hidden">
        <Link href="/dashboard/projects" className="text-sm text-indigo-600 hover:underline">← Back to Projects</Link>
        <PrintButton />
      </div>

      <h1 className="text-2xl font-bold mb-1">Projects</h1>
      <p className="text-sm text-gray-500 mb-8">
        Printed {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
        {' · '}{(projects ?? []).length} projects total
      </p>

      {grouped.map(([entity, entityProjects]) => (
        <div key={entity} className="mb-10">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 border-b border-gray-200 pb-1 mb-4">{entity}</h2>
          <div className="flex flex-col gap-6">
            {entityProjects.map((p: any) => {
              const ptasks = tasksByProject(p.id)
              const openCount = ptasks.filter((t: any) => t.status !== 'done' && t.status !== 'cancelled').length
              const doneCount = ptasks.filter((t: any) => t.status === 'done').length
              return (
                <div key={p.id} className="border border-gray-100 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div>
                      <h3 className="font-semibold text-base">{p.name}</h3>
                      {p.description && <p className="text-sm text-gray-500 mt-0.5">{p.description}</p>}
                    </div>
                    <div className="text-right shrink-0 text-xs text-gray-400">
                      <p className="font-medium">{STATUS_LABELS[p.status] ?? p.status}</p>
                      {p.phase && <p>{p.phase}</p>}
                      {p.priority && <p>{PRIORITY_LABELS[p.priority] ?? p.priority} priority</p>}
                      {p.due_date && <p>Due {new Date(p.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>}
                    </div>
                  </div>

                  {p.next_action && (
                    <div className="mb-3 rounded bg-gray-50 px-3 py-2 text-xs">
                      <span className="font-medium text-gray-500">Next: </span>
                      <span>{p.next_action}</span>
                      {p.next_action_due && <span className="text-gray-400 ml-2">· Due {p.next_action_due}</span>}
                    </div>
                  )}

                  {ptasks.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-400 mb-1">{openCount} open · {doneCount} done · {ptasks.length} total tasks</p>
                      <table className="w-full text-xs">
                        <tbody>
                          {ptasks.map((t: any) => (
                            <tr key={t.id} className="border-t border-gray-50">
                              <td className={`py-1 pr-3 ${t.status === 'done' ? 'line-through text-gray-400' : t.status === 'cancelled' ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                                {t.title}
                              </td>
                              <td className="py-1 pr-3 text-gray-400 w-20 capitalize">{t.status?.replace('_', ' ')}</td>
                              <td className="py-1 text-gray-400 w-16 capitalize">{t.priority}</td>
                              <td className="py-1 text-gray-400 w-20">
                                {t.due_date ? new Date(t.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <p className="text-xs text-gray-400 text-center mt-12">Printed {new Date().toLocaleDateString()}</p>
    </div>
  )
}

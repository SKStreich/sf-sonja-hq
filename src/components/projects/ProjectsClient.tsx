'use client'
import { useState } from 'react'
import { ProjectCard } from './ProjectCard'
import { ProjectCreateDialog } from './ProjectCreateDialog'
import { TimelineView } from '@/components/shared/TimelineView'
import type { Database, ProjectStatus, ProjectPriority, EntityType } from '@/types/supabase'

type Project = Database['public']['Tables']['projects']['Row']
type Entity = Database['public']['Tables']['entities']['Row']

const ENTITY_LABELS: Record<string, string> = { tm: 'Triplemeter', sf: 'SF Solutions', sfe: 'SF Enterprises', personal: 'Personal' }
const STATUS_LABELS: Record<ProjectStatus, string> = { planning: 'Planning', active: 'Active', on_hold: 'On Hold', complete: 'Complete' }

interface Props {
  projects: Project[]
  entities: Entity[]
}

export function ProjectsClient({ projects, entities }: Props) {
  const [view, setView] = useState<'card' | 'list' | 'timeline'>('card')
  const [filterEntity, setFilterEntity] = useState<EntityType | 'all'>('all')
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'all'>('all')
  const [filterPriority, setFilterPriority] = useState<ProjectPriority | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const entityMap = Object.fromEntries(entities.map(e => [e.id, e]))

  const filtered = projects.filter(p => {
    if (filterEntity !== 'all' && entityMap[p.entity_id]?.type !== filterEntity) return false
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    if (filterPriority !== 'all' && p.priority !== filterPriority) return false
    return true
  })

  const btnCls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-all ${active ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`

  return (
    <>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Projects</h1>
            <p className="mt-0.5 text-sm text-gray-500">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
            <span>+</span> New project
          </button>
        </div>

        {/* Filters + view toggle */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Entity filter */}
          <div className="flex items-center rounded-lg border border-gray-800 bg-gray-900 p-1 gap-1">
            <button className={btnCls(filterEntity === 'all')} onClick={() => setFilterEntity('all')}>All</button>
            {entities.map(e => (
              <button key={e.id} className={btnCls(filterEntity === e.type as EntityType)} onClick={() => setFilterEntity(e.type as EntityType)}>
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: e.color ?? undefined }} />
                {ENTITY_LABELS[e.type] ?? e.name}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ProjectStatus | 'all')}
            className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-400 outline-none focus:border-gray-700">
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>

          {/* Priority filter */}
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as ProjectPriority | 'all')}
            className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-1.5 text-xs text-gray-400 outline-none focus:border-gray-700">
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* View toggle */}
          <div className="ml-auto flex items-center rounded-lg border border-gray-800 bg-gray-900 p-1 gap-1">
            <button className={btnCls(view === 'card')} onClick={() => setView('card')}>⊞ Cards</button>
            <button className={btnCls(view === 'list')} onClick={() => setView('list')}>≡ List</button>
            <button className={btnCls(view === 'timeline')} onClick={() => setView('timeline')}>⋯ Timeline</button>
          </div>
        </div>

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-800 py-20">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-400 font-medium mb-1">No projects yet</p>
            <p className="text-gray-600 text-sm mb-4">Create your first project to get started</p>
            <button onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
              + New project
            </button>
          </div>
        )}

        {/* Card view */}
        {view === 'card' && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => <ProjectCard key={p.id} project={p} entity={entityMap[p.entity_id]} />)}
          </div>
        )}

        {/* List view */}
        {view === 'list' && filtered.length > 0 && (
          <div className="rounded-xl border border-gray-800 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Project</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden sm:table-cell">Entity</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden md:table-cell">Priority</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden lg:table-cell">Next action</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 hidden md:table-cell">Due</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const entity = entityMap[p.entity_id]
                  const isOverdue = p.due_date && new Date(p.due_date) < new Date() && p.status !== 'complete'
                  return (
                    <tr key={p.id} className="border-b border-gray-800/50 hover:bg-gray-900/40 transition-colors cursor-pointer"
                      onClick={() => window.location.href = `/dashboard/projects/${p.id}`}>
                      <td className="px-4 py-3 text-white font-medium">{p.name}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        {entity && (
                          <span className="flex items-center gap-1.5 text-gray-400 text-xs">
                            <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: entity.color ?? undefined }} />
                            {ENTITY_LABELS[entity.type] ?? entity.name}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.status === 'active' ? 'bg-indigo-900/60 text-indigo-300' :
                          p.status === 'complete' ? 'bg-green-900/60 text-green-300' :
                          p.status === 'on_hold' ? 'bg-yellow-900/60 text-yellow-300' :
                          'bg-gray-800 text-gray-400'
                        }`}>{p.status.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`text-xs ${p.priority === 'high' ? 'text-red-400' : p.priority === 'medium' ? 'text-orange-400' : 'text-gray-500'}`}>
                          {p.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell max-w-xs truncate">{p.next_action ?? '—'}</td>
                      <td className={`px-4 py-3 text-xs hidden md:table-cell ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
                        {p.due_date ? new Date(p.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Timeline view */}
        {view === 'timeline' && filtered.length > 0 && (
          <TimelineView
            items={filtered.map(p => ({
              id: p.id,
              name: p.name,
              startDate: p.created_at ? p.created_at.slice(0, 10) : null,
              endDate: p.due_date ?? null,
              entityType: entityMap[p.entity_id]?.type,
              entityName: ENTITY_LABELS[entityMap[p.entity_id]?.type] ?? entityMap[p.entity_id]?.name,
              href: `/dashboard/projects/${p.id}`,
            }))}
            emptyLabel="No projects to display"
          />
        )}
      </div>

      <ProjectCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} entities={entities} />
    </>
  )
}

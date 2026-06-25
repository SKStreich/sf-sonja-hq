'use client'
import { useState } from 'react'
import { ProjectCard } from './ProjectCard'
import { ProjectCreateDialog } from './ProjectCreateDialog'
import { ProjectEntityChips } from './ProjectEntityChips'
import { TimelineView, type TimelineItem } from '@/components/shared/TimelineView'
import { entityLabel } from '@/lib/entities/config'
import { groupAreasByEntity, NO_AREA, type Area } from '@/lib/areas/areas'
import type { TaskProgress } from '@/lib/projects/progress'
import type { Database, ProjectStatus, ProjectPriority, EntityType } from '@/types/supabase'

type Project = Database['public']['Tables']['projects']['Row']
type Entity = Database['public']['Tables']['entities']['Row']

export interface ProjectTask {
  id: string
  title: string
  due_date: string | null
  status: string
  project_id: string | null
}

const STATUS_LABELS: Record<ProjectStatus, string> = { planning: 'Planning', active: 'Active', on_hold: 'On Hold', complete: 'Complete' }

interface Props {
  projects: Project[]
  entities: Entity[]
  /** project_id → entity_id[] from the project_entities junction (multi-entity). */
  projectEntities?: Record<string, string[]>
  /** All areas (Sprint 13 A3) + project_id → area_id[]. */
  areas?: Area[]
  projectAreas?: Record<string, string[]>
  /** project_id → completion. */
  progress?: Record<string, TaskProgress>
  /** project_id → its non-archived tasks (for the timeline view). */
  tasksByProject?: Record<string, ProjectTask[]>
}

export function ProjectsClient({ projects, entities, projectEntities = {}, areas = [], projectAreas = {}, progress = {}, tasksByProject = {} }: Props) {
  const [view, setView] = useState<'card' | 'list' | 'timeline'>('card')
  const [filterEntity, setFilterEntity] = useState<EntityType | 'all'>('all')
  const [filterArea, setFilterArea] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | 'all'>('all')
  const [filterPriority, setFilterPriority] = useState<ProjectPriority | 'all'>('all')
  const [createOpen, setCreateOpen] = useState(false)

  const entityMap = Object.fromEntries(entities.map(e => [e.id, e]))
  const areaNames = Object.fromEntries(areas.map(a => [a.id, a.name]))
  // Areas for the selected entity (the Entity→Area sub-filter, D7).
  const entityAreas = filterEntity === 'all' ? [] : (groupAreasByEntity(areas)[filterEntity] ?? [])
  const areaNamesOf = (p: Project): string[] => (projectAreas[p.id] ?? []).map(id => areaNames[id]).filter(Boolean) as string[]

  // Resolve a project's full entity set from the junction (sole source of truth).
  const entitiesOf = (p: Project): Entity[] => {
    const ids = projectEntities[p.id] ?? []
    return ids.map(id => entityMap[id]).filter(Boolean) as Entity[]
  }

  const filtered = projects.filter(p => {
    // OR-semantics: a project matches the entity filter if ANY of its entities matches.
    if (filterEntity !== 'all' && !entitiesOf(p).some(e => e.type === filterEntity)) return false
    if (filterArea !== null) {
      const ids = projectAreas[p.id] ?? []
      if (filterArea === NO_AREA ? ids.length > 0 : !ids.includes(filterArea)) return false
    }
    if (filterStatus !== 'all' && p.status !== filterStatus) return false
    if (filterPriority !== 'all' && p.priority !== filterPriority) return false
    return true
  })

  const btnCls = (active: boolean) =>
    `rounded-md px-3 py-1.5 text-xs font-medium transition-all ${active ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:text-gray-700'}`

  return (
    <>
      <div className="mx-auto max-w-7xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
            <p className="mt-0.5 text-sm text-gray-500">{filtered.length} project{filtered.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-2">
            <a href="/api/projects/export"
              title="Download projects as CSV"
              aria-label="Download projects CSV"
              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
              ⬇
            </a>
            <a href="/dashboard/projects/print"
              target="_blank"
              title="Print all projects"
              aria-label="Print projects"
              className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
              🖨
            </a>
            <button onClick={() => setCreateOpen(true)}
              className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
              <span>+</span> New project
            </button>
          </div>
        </div>

        {/* Filters + view toggle */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          {/* Entity filter */}
          <div className="flex items-center rounded-lg border border-gray-200 bg-white p-1 gap-1">
            <button className={btnCls(filterEntity === 'all')} onClick={() => { setFilterEntity('all'); setFilterArea(null) }}>All</button>
            {entities.map(e => (
              <button key={e.id} className={btnCls(filterEntity === e.type as EntityType)} onClick={() => { setFilterEntity(e.type as EntityType); setFilterArea(null) }}>
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: e.color ?? undefined }} />
                {entityLabel(e.type)}
              </button>
            ))}
          </div>

          {/* Status filter */}
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value as ProjectStatus | 'all')}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 outline-none focus:border-gray-300">
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map(s => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>

          {/* Priority filter */}
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value as ProjectPriority | 'all')}
            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs text-gray-600 outline-none focus:border-gray-300">
            <option value="all">All priorities</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* View toggle */}
          <div className="ml-auto flex items-center rounded-lg border border-gray-200 bg-white p-1 gap-1">
            <button className={btnCls(view === 'card')} onClick={() => setView('card')}>⊞ Cards</button>
            <button className={btnCls(view === 'list')} onClick={() => setView('list')}>≡ List</button>
            <button className={btnCls(view === 'timeline')} onClick={() => setView('timeline')}>⋯ Timeline</button>
          </div>
        </div>

        {/* Entity→Area sub-filter (Sprint 13 A3, D7) — under a selected entity. */}
        {filterEntity !== 'all' && entityAreas.length > 0 && (
          <div className="-mt-2 mb-5 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Area</span>
            {[{ id: null as string | null, name: 'All' }, ...entityAreas, { id: NO_AREA, name: 'No area' }].map(a => (
              <button key={a.id ?? 'all'} onClick={() => setFilterArea(a.id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  filterArea === a.id ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                {a.name}
              </button>
            ))}
          </div>
        )}

        {/* Empty state */}
        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-gray-200 py-20">
            <div className="text-4xl mb-3">📋</div>
            <p className="text-gray-500 font-medium mb-1">No projects yet</p>
            <p className="text-gray-400 text-sm mb-4">Create your first project to get started</p>
            <button onClick={() => setCreateOpen(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors">
              + New project
            </button>
          </div>
        )}

        {/* Card view */}
        {view === 'card' && filtered.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map(p => <ProjectCard key={p.id} project={p} entities={entitiesOf(p)} progress={progress[p.id]} areaNames={areaNamesOf(p)} />)}
          </div>
        )}

        {/* List view */}
        {view === 'list' && filtered.length > 0 && (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
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
                  const isOverdue = p.due_date && new Date(p.due_date) < new Date() && p.status !== 'complete'
                  return (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer"
                      onClick={() => window.location.href = `/dashboard/projects/${p.id}`}>
                      <td className="px-4 py-3 text-gray-900 font-medium">{p.name}</td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <ProjectEntityChips entities={entitiesOf(p)} />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          p.status === 'active' ? 'bg-indigo-100 text-indigo-700' :
                          p.status === 'complete' ? 'bg-green-100 text-green-700' :
                          p.status === 'on_hold' ? 'bg-amber-100 text-amber-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{p.status.replace('_', ' ')}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <span className={`text-xs ${p.priority === 'high' ? 'text-red-600' : p.priority === 'medium' ? 'text-orange-600' : 'text-gray-500'}`}>
                          {p.priority}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell max-w-xs truncate">{p.next_action ?? '—'}</td>
                      <td className={`px-4 py-3 text-xs hidden md:table-cell ${isOverdue ? 'text-red-500' : 'text-gray-500'}`}>
                        {p.due_date ? new Date(p.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Timeline view — each project bar is followed by its open, dated tasks
            as points on the same Gantt. */}
        {view === 'timeline' && filtered.length > 0 && (
          <TimelineView
            items={filtered.flatMap(p => {
              // Timeline rows carry a single colour/label; use the primary (first) entity.
              const primary = entitiesOf(p)[0]
              const projectRow: TimelineItem = {
                id: p.id,
                name: p.name,
                startDate: p.created_at ? p.created_at.slice(0, 10) : null,
                endDate: p.due_date ?? null,
                entityType: primary?.type,
                entityName: primary ? entityLabel(primary.type) : undefined,
                href: `/dashboard/projects/${p.id}`,
              }
              const taskRows: TimelineItem[] = (tasksByProject[p.id] ?? [])
                .filter(t => t.due_date && t.status !== 'done' && t.status !== 'cancelled')
                .sort((a, b) => (a.due_date! < b.due_date! ? -1 : 1))
                .map(t => ({
                  id: t.id,
                  name: `↳ ${t.title}`,
                  // A task shows as a point on its due date (no bar).
                  startDate: t.due_date,
                  endDate: null,
                  entityType: primary?.type,
                  href: `/dashboard/projects/${p.id}`,
                }))
              return [projectRow, ...taskRows]
            })}
            emptyLabel="No projects to display"
          />
        )}
      </div>

      <ProjectCreateDialog open={createOpen} onClose={() => setCreateOpen(false)} entities={entities} />
    </>
  )
}

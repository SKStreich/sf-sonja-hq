'use client'
import Link from 'next/link'
import { useState } from 'react'
import { TimelineView } from '@/components/shared/TimelineView'

// ── Helpers ──────────────────────────────────────────────────────────────────

function greeting(name: string): string {
  const hour = new Date().getHours()
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return `Good ${part}, ${name}`
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diffMs = now - then
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay === 1) return 'Yesterday'
  return `${diffDay} days ago`
}

function isOverdue(date: string | null): boolean {
  if (!date) return false
  return date < new Date().toISOString().slice(0, 10)
}

function formatDate(date: string): string {
  return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500',
  medium: 'bg-orange-400',
  low: 'bg-gray-400',
}

const UPDATE_TYPE_BORDER: Record<string, string> = {
  progress: 'border-blue-400',
  blocker: 'border-red-500',
  decision: 'border-purple-500',
  note: 'border-gray-300',
  milestone: 'border-green-500',
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface EntityBreakdown {
  id: string
  name: string
  type: string
  taskCount: number
  projectCount: number
}

interface InsightData {
  overdueTaskCount: number
  rawIdeaCount: number
  todayTaskCount: number
}

interface KnowledgeItem {
  id: string
  kind: string
  title: string | null
  summary: string | null
  body: string | null
  entity: string
  idea_status: string | null
  created_at: string
}

interface Props {
  displayName: string
  todayTasks: any[]
  overdueTasks: any[]
  activeProjects: any[]
  recentLog: any[]
  recentKnowledge: KnowledgeItem[]
  openTaskCount: number
  activeProjectCount: number
  entityBreakdown: EntityBreakdown[]
  insights: InsightData
  assignedTasks: any[]
}

// ── Entity styles ─────────────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, string> = {
  tm: 'border-blue-200 bg-blue-50',
  sf: 'border-indigo-200 bg-indigo-50',
  sfe: 'border-purple-200 bg-purple-50',
  personal: 'border-green-200 bg-green-50',
}
const ENTITY_TEXT: Record<string, string> = {
  tm: 'text-blue-700',
  sf: 'text-indigo-700',
  sfe: 'text-purple-700',
  personal: 'text-green-700',
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DashboardHome({
  displayName,
  todayTasks,
  overdueTasks,
  activeProjects,
  recentLog,
  recentKnowledge,
  openTaskCount,
  activeProjectCount,
  entityBreakdown,
  insights,
  assignedTasks,
}: Props) {
  const [knowledgeOpen, setKnowledgeOpen] = useState(recentKnowledge.length > 0)
  const [entityFilter, setEntityFilter] = useState<string | null>(null)
  const today = new Date().toISOString().slice(0, 10)

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  // Entity-scope filter — applied to all tasks/projects lists below.
  const matchesEntity = (row: any): boolean => {
    if (!entityFilter) return true
    const rowEntity = Array.isArray(row.entities) ? row.entities[0] : row.entities
    const projectEntity = row.projects?.entities
      ? (Array.isArray(row.projects.entities) ? row.projects.entities[0] : row.projects.entities)
      : null
    return rowEntity?.type === entityFilter || projectEntity?.type === entityFilter
  }
  const fTodayTasks = todayTasks.filter(matchesEntity)
  const fOverdueTasks = overdueTasks.filter(matchesEntity)
  const fActiveProjects = activeProjects.filter(matchesEntity)
  const fAssignedTasks = assignedTasks.filter(matchesEntity)
  const entityTabs = [
    { value: null as string | null, label: 'All' },
    ...entityBreakdown.map(e => ({ value: e.type, label: e.name })),
  ]

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">

      {/* ── Greeting ───────────────────────────────────────────────────────── */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{greeting(displayName)}</h1>
        <p className="mt-1 text-sm text-gray-500">{dateLabel}</p>
      </div>

      {/* ── Entity tabs ────────────────────────────────────────────────────── */}
      {entityBreakdown.length > 0 && (
        <div className="mb-6 flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1 w-fit">
          {entityTabs.map(tab => (
            <button
              key={tab.label}
              onClick={() => setEntityFilter(tab.value)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                entityFilter === tab.value
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Insight chips ──────────────────────────────────────────────────── */}
      <div className="mb-6 flex flex-wrap gap-2">
        {insights.overdueTaskCount > 0 && (
          <Link href="/dashboard/tasks" className="flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors">
            <span>⚠</span> {insights.overdueTaskCount} overdue task{insights.overdueTaskCount !== 1 ? 's' : ''}
          </Link>
        )}
        {insights.rawIdeaCount > 0 && (
          <Link href="/dashboard/knowledge" className="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 transition-colors">
            <span>💡</span> {insights.rawIdeaCount} raw idea{insights.rawIdeaCount !== 1 ? 's' : ''} to review
          </Link>
        )}
        <Link href="/dashboard/knowledge" className="flex items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors">
          <span>✦</span> Knowledge Hub
        </Link>
      </div>

      {/* ── Entity platform cards ───────────────────────────────────────────── */}
      {entityBreakdown.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {entityBreakdown.map(e => (
            <div key={e.id} className={`rounded-xl border p-3 ${ENTITY_COLORS[e.type] ?? 'border-gray-200 bg-gray-50'}`}>
              <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${ENTITY_TEXT[e.type] ?? 'text-gray-500'}`}>{e.name}</p>
              <div className="flex items-center gap-3">
                <Link href={`/dashboard/projects?entity=${e.type}`} className="text-center">
                  <p className="text-lg font-bold text-gray-900">{e.projectCount}</p>
                  <p className="text-[10px] text-gray-400">projects</p>
                </Link>
                <div className="w-px h-6 bg-gray-200" />
                <Link href={`/dashboard/tasks?entity=${e.type}`} className="text-center">
                  <p className="text-lg font-bold text-gray-900">{e.taskCount}</p>
                  <p className="text-[10px] text-gray-400">tasks</p>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Cross-entity timeline ──────────────────────────────────────────── */}
      {fActiveProjects.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Project Timeline</h2>
            <Link href="/dashboard/projects" className="text-xs text-gray-400 hover:text-gray-600 transition-colors">View all →</Link>
          </div>
          <TimelineView
            items={fActiveProjects.map((p: any) => {
              const entity = Array.isArray(p.entities) ? p.entities[0] : p.entities
              return {
                id: p.id,
                name: p.name,
                startDate: p.next_action_due ?? null,
                endDate: p.due_date ?? null,
                entityType: entity?.type,
                entityName: entity?.name,
                href: `/dashboard/projects/${p.id}`,
              }
            })}
            monthsBefore={1}
            monthsAfter={5}
            emptyLabel="No active projects with dates"
          />
        </div>
      )}

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Link
          href="/dashboard/tasks"
          className="rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Open Tasks</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{openTaskCount}</p>
        </Link>

        <Link
          href="/dashboard/projects"
          className="rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-gray-300 hover:bg-gray-50"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Active Projects</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{activeProjectCount}</p>
        </Link>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Today</p>
          <p className="mt-1 text-3xl font-bold text-gray-900">{fTodayTasks.length}</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Overdue</p>
          <p className={`mt-1 text-3xl font-bold ${fOverdueTasks.length > 0 ? 'text-red-500' : 'text-gray-900'}`}>
            {fOverdueTasks.length}
          </p>
        </div>
      </div>

      {/* ── 2-column grid ──────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Left column */}
        <div className="flex flex-col gap-6">

          {/* Today's Tasks */}
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Today</h2>
              {fTodayTasks.length > 0 && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {fTodayTasks.length}
                </span>
              )}
            </div>

            {fTodayTasks.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">Nothing on the list for today 🎉</p>
            ) : (
              <ul className="space-y-2">
                {fTodayTasks.map((task: any) => (
                  <li key={task.id} className="flex items-start gap-3">
                    <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border border-gray-300" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href="/dashboard/tasks"
                        className="block truncate text-sm text-gray-700 hover:text-gray-900"
                      >
                        {task.title}
                      </Link>
                      {task.projects?.name && (
                        <p className="truncate text-xs text-gray-400">{task.projects.name}</p>
                      )}
                    </div>
                    {task.priority && (
                      <span
                        className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${PRIORITY_DOT[task.priority] ?? 'bg-gray-300'}`}
                        title={task.priority}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 border-t border-gray-100 pt-3">
              <Link href="/dashboard/tasks" className="text-xs text-gray-400 hover:text-gray-600">
                View all tasks →
              </Link>
            </div>
          </section>

          {/* Overdue Tasks */}
          {fOverdueTasks.length > 0 && (
            <section className="rounded-xl border border-red-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Overdue</h2>
                <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                  {fOverdueTasks.length}
                </span>
              </div>

              <ul className="space-y-2">
                {fOverdueTasks.map((task: any) => (
                  <li key={task.id} className="flex items-start gap-3">
                    <span className="mt-0.5 flex-shrink-0 text-red-500">⚠</span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href="/dashboard/tasks"
                        className="block truncate text-sm text-gray-700 hover:text-gray-900"
                      >
                        {task.title}
                      </Link>
                      {task.projects?.name && (
                        <p className="truncate text-xs text-gray-400">{task.projects.name}</p>
                      )}
                    </div>
                    {task.due_date && (
                      <span className="flex-shrink-0 text-xs text-red-500">{formatDate(task.due_date)}</span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-4 border-t border-gray-100 pt-3">
                <Link href="/dashboard/tasks" className="text-xs text-gray-400 hover:text-gray-600">
                  View all tasks →
                </Link>
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">

          {/* Active Projects */}
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Active Projects</h2>
              {fActiveProjects.length > 0 && (
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                  {fActiveProjects.length}
                </span>
              )}
            </div>

            {fActiveProjects.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">No active projects</p>
            ) : (
              <ul className="space-y-3">
                {fActiveProjects.map((project: any) => {
                  const entity = Array.isArray(project.entities) ? project.entities[0] : project.entities
                  const nadOverdue = project.next_action_due && isOverdue(project.next_action_due)
                  return (
                    <li key={project.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="truncate text-sm font-medium text-gray-800 hover:text-gray-900"
                        >
                          {project.name}
                        </Link>
                        {entity?.name && (
                          <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                            {entity.name}
                          </span>
                        )}
                        {project.phase && (
                          <span className="flex-shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-400">
                            {project.phase}
                          </span>
                        )}
                      </div>
                      {project.next_action && (
                        <p className="truncate text-xs text-gray-400" title={project.next_action}>
                          {project.next_action.length > 70
                            ? project.next_action.slice(0, 70) + '…'
                            : project.next_action}
                        </p>
                      )}
                      {project.next_action_due && (
                        <p className={`text-xs ${nadOverdue ? 'text-red-500' : 'text-gray-400'}`}>
                          Due {formatDate(project.next_action_due)}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-4 border-t border-gray-100 pt-3">
              <Link href="/dashboard/projects" className="text-xs text-gray-400 hover:text-gray-600">
                View all projects →
              </Link>
            </div>
          </section>

          {/* Assigned to me */}
          {fAssignedTasks.length > 0 && (
            <section className="rounded-xl border border-indigo-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Assigned to me</h2>
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-600">
                  {fAssignedTasks.length}
                </span>
              </div>
              <ul className="space-y-2">
                {fAssignedTasks.map((task: any) => (
                  <li key={task.id} className="flex items-start gap-3">
                    <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border border-indigo-300" />
                    <div className="min-w-0 flex-1">
                      <Link href="/dashboard/tasks" className="block truncate text-sm text-gray-700 hover:text-gray-900">
                        {task.title}
                      </Link>
                      {task.projects?.name && (
                        <p className="truncate text-xs text-gray-400">{task.projects.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.due_date && (
                        <span className={`text-xs ${isOverdue(task.due_date) ? 'text-red-500' : 'text-gray-400'}`}>
                          {formatDate(task.due_date)}
                        </span>
                      )}
                      {task.priority && (
                        <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority] ?? 'bg-gray-300'}`} title={task.priority} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-gray-100 pt-3">
                <Link href="/dashboard/tasks" className="text-xs text-gray-400 hover:text-gray-600">
                  View in tasks →
                </Link>
              </div>
            </section>
          )}

          {/* Recent Log */}
          <section className="rounded-xl border border-gray-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Recent Activity</h2>
            </div>

            {recentLog.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">No recent activity</p>
            ) : (
              <ul className="space-y-3">
                {recentLog.map((entry: any) => {
                  const borderColor = UPDATE_TYPE_BORDER[entry.update_type] ?? UPDATE_TYPE_BORDER.note
                  const truncated = entry.content?.length > 80
                    ? entry.content.slice(0, 80) + '…'
                    : entry.content
                  return (
                    <li
                      key={entry.id}
                      className={`border-l-2 pl-3 ${borderColor}`}
                    >
                      <p className="text-sm text-gray-700">{truncated}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {entry.projects?.name && (
                          <Link
                            href={`/dashboard/projects/${entry.project_id}`}
                            className="text-xs text-gray-400 hover:text-gray-600"
                          >
                            {entry.projects.name}
                          </Link>
                        )}
                        <span className="text-xs text-gray-400">{relativeTime(entry.created_at)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-4 border-t border-gray-100 pt-3">
              <Link href="/dashboard/all-logs" className="text-xs text-gray-400 hover:text-gray-600">
                View all log →
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* ── Recent Knowledge ───────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <button
          type="button"
          onClick={() => setKnowledgeOpen((o) => !o)}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Recent Knowledge</h2>
            {recentKnowledge.length > 0 && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">
                {recentKnowledge.length}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-400">{knowledgeOpen ? '▲' : '▼'}</span>
        </button>

        {knowledgeOpen && (
          <div className="mt-4">
            {recentKnowledge.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">Nothing here yet — capture an idea, doc, or note.</p>
            ) : (
              <ul className="space-y-3">
                {recentKnowledge.map((item) => {
                  const kindStyle: Record<string, string> = {
                    idea: 'bg-amber-100 text-amber-800',
                    doc: 'bg-blue-100 text-blue-800',
                    chat: 'bg-purple-100 text-purple-800',
                    note: 'bg-gray-100 text-gray-700',
                  }
                  const preview = item.summary ?? item.body?.slice(0, 120) ?? ''
                  return (
                    <li key={item.id} className="flex items-start gap-3">
                      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${kindStyle[item.kind] ?? kindStyle.note}`}>
                        {item.kind}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-800">{item.title ?? '(untitled)'}</p>
                        {preview && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{preview}</p>}
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-xs uppercase tracking-wide text-gray-400">{item.entity}</span>
                          <span className="text-xs text-gray-400">{relativeTime(item.created_at)}</span>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-4 border-t border-gray-100 pt-3">
              <Link href="/dashboard/knowledge" className="text-xs text-gray-400 hover:text-gray-600">
                Open Knowledge Hub →
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

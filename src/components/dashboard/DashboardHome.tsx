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
  low: 'bg-gray-500',
}

const UPDATE_TYPE_BORDER: Record<string, string> = {
  progress: 'border-blue-500',
  blocker: 'border-red-500',
  decision: 'border-purple-500',
  note: 'border-gray-600',
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
  stalledProjects: { id: string; name: string; entity_name?: string }[]
  unreviewedCaptureCount: number
  todayTaskCount: number
}

interface Props {
  displayName: string
  todayTasks: any[]
  overdueTasks: any[]
  activeProjects: any[]
  recentLog: any[]
  captures: any[]
  openTaskCount: number
  activeProjectCount: number
  entityBreakdown: EntityBreakdown[]
  insights: InsightData
  assignedTasks: any[]
}

// ── Component ─────────────────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, string> = {
  tm: 'border-blue-800 bg-blue-950/30',
  sf: 'border-indigo-800 bg-indigo-950/30',
  sfe: 'border-purple-800 bg-purple-950/30',
  personal: 'border-green-800 bg-green-950/30',
}
const ENTITY_TEXT: Record<string, string> = {
  tm: 'text-blue-400',
  sf: 'text-indigo-400',
  sfe: 'text-purple-400',
  personal: 'text-green-400',
}

export function DashboardHome({
  displayName,
  todayTasks,
  overdueTasks,
  activeProjects,
  recentLog,
  captures,
  openTaskCount,
  activeProjectCount,
  entityBreakdown,
  insights,
  assignedTasks,
}: Props) {
  const [capturesOpen, setCapturesOpen] = useState(captures.length > 0)
  const today = new Date().toISOString().slice(0, 10)

  const dateLabel = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">

      {/* ── Greeting ───────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{greeting(displayName)}</h1>
        <p className="mt-1 text-sm text-gray-500">{dateLabel}</p>
      </div>

      {/* ── Insight chips ──────────────────────────────────────────────────── */}
      {(insights.overdueTaskCount > 0 || insights.stalledProjects.length > 0 || insights.unreviewedCaptureCount > 0) && (
        <div className="mb-6 flex flex-wrap gap-2">
          {insights.overdueTaskCount > 0 && (
            <Link href="/dashboard/tasks" className="flex items-center gap-1.5 rounded-full border border-red-900/60 bg-red-950/30 px-3 py-1 text-xs font-medium text-red-400 hover:bg-red-950/50 transition-colors">
              <span>⚠</span> {insights.overdueTaskCount} overdue task{insights.overdueTaskCount !== 1 ? 's' : ''}
            </Link>
          )}
          {insights.stalledProjects.length > 0 && (
            <Link href="/dashboard/digest" className="flex items-center gap-1.5 rounded-full border border-orange-900/60 bg-orange-950/30 px-3 py-1 text-xs font-medium text-orange-400 hover:bg-orange-950/50 transition-colors">
              <span>◎</span> {insights.stalledProjects.length} stalled project{insights.stalledProjects.length !== 1 ? 's' : ''}
            </Link>
          )}
          {insights.unreviewedCaptureCount > 0 && (
            <Link href="/dashboard/captures" className="flex items-center gap-1.5 rounded-full border border-yellow-900/60 bg-yellow-950/30 px-3 py-1 text-xs font-medium text-yellow-500 hover:bg-yellow-950/50 transition-colors">
              <span>●</span> {insights.unreviewedCaptureCount} capture{insights.unreviewedCaptureCount !== 1 ? 's' : ''} in inbox
            </Link>
          )}
          <Link href="/dashboard/digest" className="flex items-center gap-1.5 rounded-full border border-indigo-900/60 bg-indigo-950/30 px-3 py-1 text-xs font-medium text-indigo-400 hover:bg-indigo-950/50 transition-colors">
            <span>✦</span> AI Digest
          </Link>
        </div>
      )}

      {/* ── Entity platform cards ───────────────────────────────────────────── */}
      {entityBreakdown.length > 0 && (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {entityBreakdown.map(e => (
            <div key={e.id} className={`rounded-xl border p-3 ${ENTITY_COLORS[e.type] ?? 'border-gray-800 bg-gray-900/30'}`}>
              <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${ENTITY_TEXT[e.type] ?? 'text-gray-500'}`}>{e.name}</p>
              <div className="flex items-center gap-3">
                <Link href={`/dashboard/projects?entity=${e.type}`} className="text-center">
                  <p className="text-lg font-bold text-white">{e.projectCount}</p>
                  <p className="text-[10px] text-gray-600">projects</p>
                </Link>
                <div className="w-px h-6 bg-gray-800" />
                <Link href={`/dashboard/tasks?entity=${e.type}`} className="text-center">
                  <p className="text-lg font-bold text-white">{e.taskCount}</p>
                  <p className="text-[10px] text-gray-600">tasks</p>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Cross-entity timeline ──────────────────────────────────────────── */}
      {activeProjects.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Project Timeline</h2>
            <Link href="/dashboard/projects" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">View all →</Link>
          </div>
          <TimelineView
            items={activeProjects.map((p: any) => {
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
          className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 transition-colors hover:border-gray-700 hover:bg-gray-900/60"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Open Tasks</p>
          <p className="mt-1 text-3xl font-bold text-white">{openTaskCount}</p>
        </Link>

        <Link
          href="/dashboard/projects"
          className="rounded-xl border border-gray-800 bg-gray-900/40 p-4 transition-colors hover:border-gray-700 hover:bg-gray-900/60"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Active Projects</p>
          <p className="mt-1 text-3xl font-bold text-white">{activeProjectCount}</p>
        </Link>

        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Today</p>
          <p className="mt-1 text-3xl font-bold text-white">{todayTasks.length}</p>
        </div>

        <div className="rounded-xl border border-gray-800 bg-gray-900/40 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Overdue</p>
          <p className={`mt-1 text-3xl font-bold ${overdueTasks.length > 0 ? 'text-red-400' : 'text-white'}`}>
            {overdueTasks.length}
          </p>
        </div>
      </div>

      {/* ── 2-column grid ──────────────────────────────────────────────────── */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">

        {/* Left column */}
        <div className="flex flex-col gap-6">

          {/* Today's Tasks */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Today</h2>
              {todayTasks.length > 0 && (
                <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-300">
                  {todayTasks.length}
                </span>
              )}
            </div>

            {todayTasks.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">Nothing on the list for today 🎉</p>
            ) : (
              <ul className="space-y-2">
                {todayTasks.map((task: any) => (
                  <li key={task.id} className="flex items-start gap-3">
                    {/* Circle checkbox placeholder */}
                    <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border border-gray-600" />
                    <div className="min-w-0 flex-1">
                      <Link
                        href="/dashboard/tasks"
                        className="block truncate text-sm text-gray-200 hover:text-white"
                      >
                        {task.title}
                      </Link>
                      {task.projects?.name && (
                        <p className="truncate text-xs text-gray-500">{task.projects.name}</p>
                      )}
                    </div>
                    {task.priority && (
                      <span
                        className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${PRIORITY_DOT[task.priority] ?? 'bg-gray-600'}`}
                        title={task.priority}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 border-t border-gray-800 pt-3">
              <Link href="/dashboard/tasks" className="text-xs text-gray-500 hover:text-gray-300">
                View all tasks →
              </Link>
            </div>
          </section>

          {/* Overdue Tasks */}
          {overdueTasks.length > 0 && (
            <section className="rounded-xl border border-red-900/40 bg-gray-900/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Overdue</h2>
                <span className="rounded-full bg-red-900/60 px-2 py-0.5 text-xs font-semibold text-red-300">
                  {overdueTasks.length}
                </span>
              </div>

              <ul className="space-y-2">
                {overdueTasks.map((task: any) => (
                  <li key={task.id} className="flex items-start gap-3">
                    <span className="mt-0.5 flex-shrink-0 text-red-400">⚠</span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href="/dashboard/tasks"
                        className="block truncate text-sm text-gray-200 hover:text-white"
                      >
                        {task.title}
                      </Link>
                      {task.projects?.name && (
                        <p className="truncate text-xs text-gray-500">{task.projects.name}</p>
                      )}
                    </div>
                    {task.due_date && (
                      <span className="flex-shrink-0 text-xs text-red-400">{formatDate(task.due_date)}</span>
                    )}
                  </li>
                ))}
              </ul>

              <div className="mt-4 border-t border-gray-800 pt-3">
                <Link href="/dashboard/tasks" className="text-xs text-gray-500 hover:text-gray-300">
                  View all tasks →
                </Link>
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">

          {/* Active Projects */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/30 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Active Projects</h2>
              {activeProjects.length > 0 && (
                <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-300">
                  {activeProjects.length}
                </span>
              )}
            </div>

            {activeProjects.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">No active projects</p>
            ) : (
              <ul className="space-y-3">
                {activeProjects.map((project: any) => {
                  const entity = Array.isArray(project.entities) ? project.entities[0] : project.entities
                  const nadOverdue = project.next_action_due && isOverdue(project.next_action_due)
                  return (
                    <li key={project.id} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/projects/${project.id}`}
                          className="truncate text-sm font-medium text-gray-200 hover:text-white"
                        >
                          {project.name}
                        </Link>
                        {entity?.name && (
                          <span className="flex-shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-400">
                            {entity.name}
                          </span>
                        )}
                        {project.phase && (
                          <span className="flex-shrink-0 rounded bg-gray-800 px-1.5 py-0.5 text-xs text-gray-500">
                            {project.phase}
                          </span>
                        )}
                      </div>
                      {project.next_action && (
                        <p className="truncate text-xs text-gray-500" title={project.next_action}>
                          {project.next_action.length > 70
                            ? project.next_action.slice(0, 70) + '…'
                            : project.next_action}
                        </p>
                      )}
                      {project.next_action_due && (
                        <p className={`text-xs ${nadOverdue ? 'text-red-400' : 'text-gray-600'}`}>
                          Due {formatDate(project.next_action_due)}
                        </p>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-4 border-t border-gray-800 pt-3">
              <Link href="/dashboard/projects" className="text-xs text-gray-500 hover:text-gray-300">
                View all projects →
              </Link>
            </div>
          </section>

          {/* Assigned to me */}
          {assignedTasks.length > 0 && (
            <section className="rounded-xl border border-indigo-900/40 bg-gray-900/30 p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Assigned to me</h2>
                <span className="rounded-full bg-indigo-900/60 px-2 py-0.5 text-xs font-semibold text-indigo-300">
                  {assignedTasks.length}
                </span>
              </div>
              <ul className="space-y-2">
                {assignedTasks.map((task: any) => (
                  <li key={task.id} className="flex items-start gap-3">
                    <span className="mt-0.5 h-4 w-4 flex-shrink-0 rounded-full border border-indigo-700" />
                    <div className="min-w-0 flex-1">
                      <Link href="/dashboard/tasks" className="block truncate text-sm text-gray-200 hover:text-white">
                        {task.title}
                      </Link>
                      {task.projects?.name && (
                        <p className="truncate text-xs text-gray-500">{task.projects.name}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {task.due_date && (
                        <span className={`text-xs ${isOverdue(task.due_date) ? 'text-red-400' : 'text-gray-600'}`}>
                          {formatDate(task.due_date)}
                        </span>
                      )}
                      {task.priority && (
                        <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[task.priority] ?? 'bg-gray-600'}`} title={task.priority} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-4 border-t border-gray-800 pt-3">
                <Link href="/dashboard/tasks" className="text-xs text-gray-500 hover:text-gray-300">
                  View in tasks →
                </Link>
              </div>
            </section>
          )}

          {/* Recent Log */}
          <section className="rounded-xl border border-gray-800 bg-gray-900/30 p-4">
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
                      <p className="text-sm text-gray-300">{truncated}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {entry.projects?.name && (
                          <Link
                            href={`/dashboard/projects/${entry.project_id}`}
                            className="text-xs text-gray-500 hover:text-gray-300"
                          >
                            {entry.projects.name}
                          </Link>
                        )}
                        <span className="text-xs text-gray-600">{relativeTime(entry.created_at)}</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="mt-4 border-t border-gray-800 pt-3">
              <Link href="/dashboard/all-logs" className="text-xs text-gray-500 hover:text-gray-300">
                View all log →
              </Link>
            </div>
          </section>
        </div>
      </div>

      {/* ── Ideas Inbox ────────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-gray-800 bg-gray-900/30 p-4">
        <button
          type="button"
          onClick={() => setCapturesOpen((o) => !o)}
          className="flex w-full items-center justify-between"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Ideas Inbox</h2>
            {captures.length > 0 && (
              <span className="rounded-full bg-gray-700 px-2 py-0.5 text-xs font-semibold text-gray-300">
                {captures.length}
              </span>
            )}
          </div>
          <span className="text-xs text-gray-600">{capturesOpen ? '▲' : '▼'}</span>
        </button>

        {capturesOpen && (
          <div className="mt-4">
            {captures.length === 0 ? (
              <p className="py-4 text-center text-sm text-gray-500">Inbox zero 🎉</p>
            ) : (
              <ul className="space-y-3">
                {captures.map((capture: any) => (
                  <li key={capture.id} className="flex items-start gap-3">
                    <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${
                      capture.type === 'idea'
                        ? 'bg-purple-900/50 text-purple-300'
                        : capture.type === 'task'
                        ? 'bg-blue-900/50 text-blue-300'
                        : 'bg-gray-800 text-gray-400'
                    }`}>
                      {capture.type ?? 'note'}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-200">{capture.content}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        {capture.entity_context && (
                          <span className="text-xs text-gray-500">{capture.entity_context}</span>
                        )}
                        <span className="text-xs text-gray-600">{relativeTime(capture.created_at)}</span>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <div className="mt-4 border-t border-gray-800 pt-3">
              <Link href="/dashboard/captures" className="text-xs text-gray-500 hover:text-gray-300">
                Review all captures →
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  )
}

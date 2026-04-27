'use client'
import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import {
  moveTaskBucket, completeTask, uncompleteTask, deleteTask, createManagerTask, cancelTask, reopenTask,
  type GtdBucket,
} from '@/app/api/tasks/actions'
import { TaskDetailPanel } from './TaskDetailPanel'
import { TimelineView } from '@/components/shared/TimelineView'

type Task = any
type Project = any
type Entity = any

const BUCKETS: { id: GtdBucket; label: string; color: string; accent: string }[] = [
  { id: 'today',     label: 'Today',     color: 'text-orange-600',  accent: 'border-orange-200 bg-orange-50/50' },
  { id: 'this_week', label: 'This Week', color: 'text-indigo-600',  accent: 'border-indigo-200 bg-indigo-50/50' },
  { id: 'backlog',   label: 'Backlog',   color: 'text-gray-500',    accent: 'border-gray-200 bg-transparent' },
  { id: 'someday',   label: 'Someday',   color: 'text-gray-400',    accent: 'border-gray-100 bg-transparent' },
]

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-orange-400', low: 'bg-gray-400',
}

const ENTITY_LABELS: Record<string, string> = {
  tm: 'Triplemeter',
  sf: 'SF Solutions',
  sfe: 'SF Enterprises',
  personal: 'Personal',
}

function isOverdue(dueDate: string | null): boolean {
  if (!dueDate) return false
  return new Date(dueDate + 'T23:59:59') < new Date()
}

function formatDue(dueDate: string | null): string {
  if (!dueDate) return ''
  return new Date(dueDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface AddTaskRowProps {
  bucket: GtdBucket
  projects: Project[]
  entities: Entity[]
  onDone: () => void
}

function AddTaskRow({ bucket, projects, entities, onDone }: AddTaskRowProps) {
  const [title, setTitle] = useState('')
  const [projectId, setProjectId] = useState<string>('')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [dueDate, setDueDate] = useState('')
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)

  const personalEntity = entities.find(e => e.type === 'personal')

  const submit = () => {
    if (!title.trim()) return
    const project = projects.find(p => p.id === projectId)
    const entityId = project?.entity_id ?? personalEntity?.id ?? entities[0]?.id
    if (!entityId) return

    startTransition(async () => {
      await createManagerTask({
        title: title.trim(),
        gtd_bucket: bucket,
        entity_id: entityId,
        project_id: projectId || null,
        priority,
        due_date: dueDate || null,
      })
      setTitle('')
      setProjectId('')
      setPriority('medium')
      setDueDate('')
      onDone()
    })
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 p-3 mt-2">
      <input
        ref={inputRef}
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onDone() }}
        placeholder="Task title…"
        className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 outline-none"
        >
          <option value="">No project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as any)}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 outline-none"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-600 outline-none"
        />
        <div className="ml-auto flex gap-2">
          <button onClick={onDone} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
          <button
            onClick={submit}
            disabled={!title.trim() || pending}
            className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
          >
            {pending ? '…' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

type StatusFilter = 'all' | 'open' | 'done' | 'cancelled'

interface OrgMemberRow { id: string; full_name: string | null; email: string }

function initials(member: OrgMemberRow): string {
  const name = member.full_name ?? member.email
  return name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
}

interface TaskRowProps {
  task: Task
  statusFilter: StatusFilter
  members: OrgMemberRow[]
  onOpenDetail: (task: Task) => void
}

function TaskRow({ task, statusFilter, members, onOpenDetail }: TaskRowProps) {
  const [completing, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const done = task.status === 'done'
  const cancelled = task.status === 'cancelled'
  const overdue = !done && !cancelled && isOverdue(task.due_date)

  if (statusFilter === 'open' && (done || cancelled)) return null
  if (statusFilter === 'done' && !done) return null
  if (statusFilter === 'cancelled' && !cancelled) return null

  const toggleCircle = () => {
    startTransition(async () => {
      if (done || cancelled) await reopenTask(task.id)
      else await completeTask(task.id)
    })
  }

  const moveTo = (bucket: GtdBucket) => {
    setMenuOpen(false)
    startTransition(async () => { await moveTaskBucket(task.id, bucket) })
  }

  const handleCancel = () => {
    setMenuOpen(false)
    startTransition(async () => { await cancelTask(task.id) })
  }

  const handleReopen = () => {
    setMenuOpen(false)
    startTransition(async () => { await reopenTask(task.id) })
  }

  const remove = () => {
    setMenuOpen(false)
    startTransition(async () => { await deleteTask(task.id, task.project_id ?? '') })
  }

  return (
    <div className={`group flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-50 transition-colors ${completing ? 'opacity-50' : ''}`}>
      {/* Circle */}
      <button
        onClick={toggleCircle}
        className={`mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
          done ? 'bg-green-500 border-green-500' :
          cancelled ? 'bg-red-100 border-red-400' :
          'border-gray-300 hover:border-gray-500'
        }`}
      >
        {done && <span className="text-white text-xs leading-none">✓</span>}
        {cancelled && <span className="text-red-500 text-xs leading-none">✕</span>}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          onClick={() => onOpenDetail(task)}
          className={`text-sm leading-snug cursor-pointer hover:underline ${
            cancelled ? 'line-through text-red-400/70' :
            done ? 'line-through text-gray-400' :
            'text-gray-900'
          }`}
        >
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {task.projects && (
            <Link
              href={`/dashboard/projects/${task.project_id}`}
              className="text-xs text-indigo-600 hover:text-indigo-700 transition-colors truncate max-w-[180px]"
              onClick={e => e.stopPropagation()}
            >
              {task.projects.name}
            </Link>
          )}
          {!task.projects && task.entities && (
            <span className="text-xs text-gray-400">
              {ENTITY_LABELS[task.entities.type] ?? task.entities.name}
            </span>
          )}
          {task.due_date && (
            <span className={`text-xs ${overdue ? 'text-red-500' : 'text-gray-400'}`}>
              {overdue ? '⚠ ' : ''}{formatDue(task.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Assignee avatar */}
      {task.assignee_id && (() => {
        const m = members.find(m => m.id === task.assignee_id)
        return m ? (
          <span className="mt-0.5 shrink-0 flex items-center justify-center w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-bold" title={m.full_name ?? m.email}>
            {initials(m)}
          </span>
        ) : null
      })()}

      {/* Priority dot */}
      <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority] ?? 'bg-gray-300'}`} title={task.priority} />

      {/* Actions menu */}
      <div className="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="rounded p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors text-sm"
        >
          ⋮
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-7 z-20 w-40 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
              <div className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-gray-400">Move to</div>
              {BUCKETS.map(b => (
                <button
                  key={b.id}
                  onClick={() => moveTo(b.id)}
                  disabled={task.gtd_bucket === b.id}
                  className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                    task.gtd_bucket === b.id ? 'text-gray-300 cursor-default' : `${b.color} hover:bg-gray-50`
                  }`}
                >
                  {b.label}
                </button>
              ))}
              <div className="my-1 border-t border-gray-100" />
              {!done && !cancelled && (
                <button onClick={handleCancel} className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
              )}
              {(done || cancelled) && (
                <button onClick={handleReopen} className="w-full px-3 py-1.5 text-left text-xs text-gray-600 hover:bg-gray-50 transition-colors">
                  Reopen
                </button>
              )}
              <button onClick={remove} className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-gray-50 transition-colors">
                Delete
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface BucketSectionProps {
  bucket: (typeof BUCKETS)[number]
  tasks: Task[]
  projects: Project[]
  entities: Entity[]
  members: OrgMemberRow[]
  statusFilter: StatusFilter
  onOpenDetail: (task: Task) => void
}

function BucketSection({ bucket, tasks, projects, entities, members, statusFilter, onOpenDetail }: BucketSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [adding, setAdding] = useState(false)

  const visibleTasks = tasks.filter(t => {
    if (statusFilter === 'open') return t.status !== 'done' && t.status !== 'cancelled'
    if (statusFilter === 'done') return t.status === 'done'
    if (statusFilter === 'cancelled') return t.status === 'cancelled'
    return true
  })

  const doneCount = tasks.filter(t => t.status === 'done').length

  return (
    <div className={`rounded-xl border ${bucket.accent} mb-4`}>
      <button
        onClick={() => setCollapsed(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className={`text-xs font-bold uppercase tracking-widest ${bucket.color}`}>{bucket.label}</span>
        <span className="text-xs text-gray-400">{visibleTasks.length}{doneCount > 0 && statusFilter === 'open' ? ` · ${doneCount} done` : ''}</span>
        <span className={`ml-auto text-gray-400 text-xs transition-transform ${collapsed ? '' : 'rotate-90'}`}>▶</span>
      </button>

      {!collapsed && (
        <div className="px-2 pb-2">
          {visibleTasks.length === 0 && !adding && (
            <p className="px-3 py-2 text-xs text-gray-400 italic">
              {bucket.id === 'today' && statusFilter === 'open' ? 'Nothing for today — nice.' : 'Empty.'}
            </p>
          )}
          {tasks.map(t => (
            <TaskRow key={t.id} task={t} statusFilter={statusFilter} members={members} onOpenDetail={onOpenDetail} />
          ))}
          {adding
            ? <AddTaskRow bucket={bucket.id} projects={projects} entities={entities} onDone={() => setAdding(false)} />
            : (
              <button
                onClick={() => setAdding(true)}
                className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors w-full"
              >
                <span>+</span> Add task
              </button>
            )
          }
        </div>
      )}
    </div>
  )
}

interface OrgMember { id: string; full_name: string | null; email: string }

interface Props {
  tasks: Task[]
  projects: Project[]
  entities: Entity[]
  members?: OrgMember[]
  currentUserId?: string
}

export function TaskManager({ tasks, projects, entities, members = [], currentUserId }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [filterEntity, setFilterEntity] = useState<string>('all')
  const [mineOnly, setMineOnly] = useState(false)
  const [addingQuick, setAddingQuick] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)
  const [view, setView] = useState<'buckets' | 'timeline'>('buckets')

  const filtered = (() => {
    let list = filterEntity === 'all'
      ? tasks
      : tasks.filter(t => t.entities?.type === filterEntity || t.projects?.entity_id === entities.find(e => e.type === filterEntity)?.id)
    if (mineOnly && currentUserId) list = list.filter(t => t.assignee_id === currentUserId)
    return list
  })()

  const byBucket = (bucket: GtdBucket) => filtered.filter(t => t.gtd_bucket === bucket)

  const openCount = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length
  const doneCount = tasks.filter(t => t.status === 'done').length
  const cancelledCount = tasks.filter(t => t.status === 'cancelled').length

  const btnActive = 'bg-gray-200 text-gray-900'
  const btnInactive = 'text-gray-500 hover:text-gray-700'

  const totalCount = openCount + doneCount + cancelledCount
  const STATUS_TILES: { id: StatusFilter; label: string; count: number; tone: string }[] = [
    { id: 'all',       label: 'All',       count: totalCount,     tone: 'border-gray-200 hover:border-gray-300' },
    { id: 'open',      label: 'Open',      count: openCount,      tone: 'border-indigo-200 hover:border-indigo-300' },
    { id: 'done',      label: 'Done',      count: doneCount,      tone: 'border-green-200 hover:border-green-300' },
    { id: 'cancelled', label: 'Cancelled', count: cancelledCount, tone: 'border-red-200 hover:border-red-300' },
  ]

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header row 1 — title + page-level actions */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tasks</h1>
          <p className="mt-0.5 text-sm text-gray-500">{totalCount} task{totalCount === 1 ? '' : 's'} across all entities</p>
        </div>
        <div className="flex items-center gap-2">
          <a href="/api/tasks/export"
            title="Download tasks as CSV"
            aria-label="Download tasks CSV"
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
            ⬇
          </a>
          <a href="/dashboard/tasks/print"
            target="_blank"
            title="Print tasks"
            aria-label="Print tasks"
            className="rounded-lg border border-gray-200 bg-white p-2 text-gray-600 hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 transition-colors">
            🖨
          </a>
          <button
            onClick={() => setAddingQuick(true)}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            <span>+</span> New Task
          </button>
        </div>
      </div>

      {/* Status count tiles — also act as the status filter */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {STATUS_TILES.map(t => {
          const active = statusFilter === t.id
          return (
            <button
              key={t.id}
              onClick={() => setStatusFilter(t.id)}
              className={`rounded-xl border bg-white px-4 py-3 text-left transition-all ${
                active
                  ? 'border-indigo-500 ring-2 ring-indigo-100'
                  : t.tone
              }`}
            >
              <p className="text-xs font-medium uppercase tracking-wider text-gray-500">{t.label}</p>
              <p className="mt-1 text-2xl font-bold text-gray-900">{t.count}</p>
            </button>
          )
        })}
      </div>

      {/* Header row 2 — entity filter (mirrors Projects) + view toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="flex items-center rounded-lg border border-gray-200 bg-white p-1 gap-1 flex-wrap">
          <button
            onClick={() => setFilterEntity('all')}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterEntity === 'all' ? btnActive : btnInactive}`}
          >All</button>
          {entities.map(e => (
            <button
              key={e.id}
              onClick={() => setFilterEntity(e.type)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterEntity === e.type ? btnActive : btnInactive}`}
            >
              <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: e.color ?? undefined }} />
              {ENTITY_LABELS[e.type] ?? e.name}
            </button>
          ))}
        </div>

        {currentUserId && members.length > 1 && (
          <button
            onClick={() => setMineOnly(o => !o)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              mineOnly
                ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                : 'border-gray-200 bg-white text-gray-500 hover:text-gray-700'
            }`}
          >
            👤 Mine only
          </button>
        )}

        <div className="ml-auto flex items-center rounded-lg border border-gray-200 bg-white p-1 gap-1">
          <button
            onClick={() => setView('buckets')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === 'buckets' ? btnActive : btnInactive}`}
          >≡ Buckets</button>
          <button
            onClick={() => setView('timeline')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${view === 'timeline' ? btnActive : btnInactive}`}
          >⋯ Timeline</button>
        </div>
      </div>

      {addingQuick && (
        <div className="mb-4">
          <AddTaskRow bucket="today" projects={projects} entities={entities} onDone={() => setAddingQuick(false)} />
        </div>
      )}

      {/* Bucket sections */}
      {view === 'buckets' && BUCKETS.map(bucket => (
        <BucketSection
          key={bucket.id}
          bucket={bucket}
          tasks={byBucket(bucket.id)}
          projects={projects}
          entities={entities}
          members={members}
          statusFilter={statusFilter}
          onOpenDetail={setSelectedTask}
        />
      ))}

      {/* Timeline view */}
      {view === 'timeline' && (
        <TimelineView
          items={tasks
            .filter(t => t.status !== 'done' && t.status !== 'cancelled')
            .filter(t => filterEntity === 'all' || t.entities?.type === filterEntity)
            .map(t => ({
              id: t.id,
              name: t.title,
              startDate: t.created_at ? t.created_at.slice(0, 10) : null,
              endDate: t.due_date ?? null,
              entityType: t.entities?.type,
              entityName: ENTITY_LABELS[t.entities?.type] ?? t.entities?.name,
            }))}
          emptyLabel="No open tasks to display on timeline"
        />
      )}

      {/* Detail panel */}
      {selectedTask && (
        <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} projects={projects} entities={entities} members={members} />
      )}
    </div>
  )
}

'use client'
import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import {
  moveTaskBucket, completeTask, uncompleteTask, deleteTask, createManagerTask, cancelTask, reopenTask,
  type GtdBucket,
} from '@/app/api/tasks/actions'
import { TaskDetailPanel } from './TaskDetailPanel'

type Task = any
type Project = any
type Entity = any

const BUCKETS: { id: GtdBucket; label: string; color: string; accent: string }[] = [
  { id: 'today',     label: 'Today',     color: 'text-orange-400',  accent: 'border-orange-900/40 bg-orange-950/10' },
  { id: 'this_week', label: 'This Week', color: 'text-indigo-400',  accent: 'border-indigo-900/40 bg-indigo-950/10' },
  { id: 'backlog',   label: 'Backlog',   color: 'text-gray-400',    accent: 'border-gray-800 bg-transparent' },
  { id: 'someday',   label: 'Someday',   color: 'text-gray-600',    accent: 'border-gray-800/50 bg-transparent' },
]

const PRIORITY_COLORS: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-orange-400', low: 'bg-gray-600',
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
    <div className="flex flex-col gap-2 rounded-lg border border-dashed border-gray-700 bg-gray-900/30 p-3 mt-2">
      <input
        ref={inputRef}
        autoFocus
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onDone() }}
        placeholder="Task title…"
        className="w-full bg-transparent text-sm text-white placeholder-gray-600 outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={projectId}
          onChange={e => setProjectId(e.target.value)}
          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-400 outline-none"
        >
          <option value="">No project</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select
          value={priority}
          onChange={e => setPriority(e.target.value as any)}
          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-400 outline-none"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <input
          type="date"
          value={dueDate}
          onChange={e => setDueDate(e.target.value)}
          className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-xs text-gray-400 outline-none"
        />
        <div className="ml-auto flex gap-2">
          <button onClick={onDone} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Cancel</button>
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

interface TaskRowProps {
  task: Task
  statusFilter: StatusFilter
  onOpenDetail: (task: Task) => void
}

function TaskRow({ task, statusFilter, onOpenDetail }: TaskRowProps) {
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
    <div className={`group flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-900/40 transition-colors ${completing ? 'opacity-50' : ''}`}>
      {/* Circle */}
      <button
        onClick={toggleCircle}
        className={`mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
          done ? 'bg-green-700 border-green-700' :
          cancelled ? 'bg-red-900 border-red-700' :
          'border-gray-600 hover:border-gray-400'
        }`}
      >
        {done && <span className="text-white text-xs leading-none">✓</span>}
        {cancelled && <span className="text-red-400 text-xs leading-none">✕</span>}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          onClick={() => onOpenDetail(task)}
          className={`text-sm leading-snug cursor-pointer hover:underline ${
            cancelled ? 'line-through text-red-400/60' :
            done ? 'line-through text-gray-600' :
            'text-white'
          }`}
        >
          {task.title}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-1">
          {task.projects && (
            <Link
              href={`/dashboard/projects/${task.project_id}`}
              className="text-xs text-indigo-500 hover:text-indigo-400 transition-colors truncate max-w-[180px]"
              onClick={e => e.stopPropagation()}
            >
              {task.projects.name}
            </Link>
          )}
          {!task.projects && task.entities && (
            <span className="text-xs text-gray-600">
              {ENTITY_LABELS[task.entities.type] ?? task.entities.name}
            </span>
          )}
          {task.due_date && (
            <span className={`text-xs ${overdue ? 'text-red-400' : 'text-gray-600'}`}>
              {overdue ? '⚠ ' : ''}{formatDue(task.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Priority dot */}
      <span className={`mt-1.5 shrink-0 w-2 h-2 rounded-full ${PRIORITY_COLORS[task.priority] ?? 'bg-gray-600'}`} title={task.priority} />

      {/* Actions menu */}
      <div className="relative shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => setMenuOpen(o => !o)}
          className="rounded p-1 text-gray-600 hover:text-gray-400 hover:bg-gray-800 transition-colors text-sm"
        >
          ⋮
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-7 z-20 w-40 rounded-lg border border-gray-700 bg-gray-900 py-1 shadow-xl">
              <div className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-gray-600">Move to</div>
              {BUCKETS.map(b => (
                <button
                  key={b.id}
                  onClick={() => moveTo(b.id)}
                  disabled={task.gtd_bucket === b.id}
                  className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                    task.gtd_bucket === b.id ? 'text-gray-700 cursor-default' : `${b.color} hover:bg-gray-800`
                  }`}
                >
                  {b.label}
                </button>
              ))}
              <div className="my-1 border-t border-gray-800" />
              {!done && !cancelled && (
                <button onClick={handleCancel} className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-gray-800 transition-colors">
                  Cancel
                </button>
              )}
              {(done || cancelled) && (
                <button onClick={handleReopen} className="w-full px-3 py-1.5 text-left text-xs text-gray-400 hover:bg-gray-800 transition-colors">
                  Reopen
                </button>
              )}
              <button onClick={remove} className="w-full px-3 py-1.5 text-left text-xs text-red-500 hover:bg-gray-800 transition-colors">
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
  statusFilter: StatusFilter
  onOpenDetail: (task: Task) => void
}

function BucketSection({ bucket, tasks, projects, entities, statusFilter, onOpenDetail }: BucketSectionProps) {
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
        <span className="text-xs text-gray-600">{visibleTasks.length}{doneCount > 0 && statusFilter === 'open' ? ` · ${doneCount} done` : ''}</span>
        <span className={`ml-auto text-gray-700 text-xs transition-transform ${collapsed ? '' : 'rotate-90'}`}>▶</span>
      </button>

      {!collapsed && (
        <div className="px-2 pb-2">
          {visibleTasks.length === 0 && !adding && (
            <p className="px-3 py-2 text-xs text-gray-700 italic">
              {bucket.id === 'today' && statusFilter === 'open' ? 'Nothing for today — nice.' : 'Empty.'}
            </p>
          )}
          {tasks.map(t => (
            <TaskRow key={t.id} task={t} statusFilter={statusFilter} onOpenDetail={onOpenDetail} />
          ))}
          {adding
            ? <AddTaskRow bucket={bucket.id} projects={projects} entities={entities} onDone={() => setAdding(false)} />
            : (
              <button
                onClick={() => setAdding(true)}
                className="mt-1 flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-gray-700 hover:text-gray-500 hover:bg-gray-900/40 transition-colors w-full"
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

interface Props {
  tasks: Task[]
  projects: Project[]
  entities: Entity[]
}

export function TaskManager({ tasks, projects, entities }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [filterEntity, setFilterEntity] = useState<string>('all')
  const [addingQuick, setAddingQuick] = useState(false)
  const [selectedTask, setSelectedTask] = useState<Task | null>(null)

  const filtered = filterEntity === 'all'
    ? tasks
    : tasks.filter(t => t.entities?.type === filterEntity || t.projects?.entity_id === entities.find(e => e.type === filterEntity)?.id)

  const byBucket = (bucket: GtdBucket) => filtered.filter(t => t.gtd_bucket === bucket)

  const openCount = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').length
  const doneCount = tasks.filter(t => t.status === 'done').length
  const cancelledCount = tasks.filter(t => t.status === 'cancelled').length

  const STATUS_FILTERS: { id: StatusFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Open' },
    { id: 'done', label: 'Done' },
    { id: 'cancelled', label: 'Cancelled' },
  ]

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {openCount} Open · {doneCount} Done · {cancelledCount} Cancelled
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center rounded-lg border border-gray-800 bg-gray-900 p-1 gap-1 flex-nowrap">
            <button
              onClick={() => setFilterEntity('all')}
              className={`whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors ${filterEntity === 'all' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >All</button>
            {entities.map(e => (
              <button
                key={e.id}
                onClick={() => setFilterEntity(e.type)}
                className={`whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors ${filterEntity === e.type ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: e.color }} />
                {ENTITY_LABELS[e.type] ?? e.name}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <a href="/api/tasks/export" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Export CSV</a>
            <a href="/dashboard/tasks/print" target="_blank" className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Print</a>
          </div>
          <button
            onClick={() => setAddingQuick(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <span className="text-sm leading-none">+</span> New Task
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-1 mb-5">
        {STATUS_FILTERS.map(sf => (
          <button
            key={sf.id}
            onClick={() => setStatusFilter(sf.id)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === sf.id ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {sf.label}
          </button>
        ))}
      </div>

      {addingQuick && (
        <div className="mb-4">
          <AddTaskRow bucket="today" projects={projects} entities={entities} onDone={() => setAddingQuick(false)} />
        </div>
      )}

      {/* Bucket sections */}
      {BUCKETS.map(bucket => (
        <BucketSection
          key={bucket.id}
          bucket={bucket}
          tasks={byBucket(bucket.id)}
          projects={projects}
          entities={entities}
          statusFilter={statusFilter}
          onOpenDetail={setSelectedTask}
        />
      ))}

      {/* Detail panel */}
      {selectedTask && (
        <TaskDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} />
      )}
    </div>
  )
}

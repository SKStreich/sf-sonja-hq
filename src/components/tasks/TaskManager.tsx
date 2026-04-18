'use client'
import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import {
  moveTaskBucket, completeTask, uncompleteTask, deleteTask, createManagerTask,
  type GtdBucket,
} from '@/app/api/tasks/actions'

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
  sf: 'Streich Force Solutions',
  sfe: 'Streich Force Enterprises',
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

interface TaskRowProps {
  task: Task
  showDone: boolean
}

function TaskRow({ task, showDone }: TaskRowProps) {
  const [completing, startTransition] = useTransition()
  const [menuOpen, setMenuOpen] = useState(false)
  const done = task.status === 'done'
  const overdue = !done && isOverdue(task.due_date)

  const toggle = () => {
    startTransition(async () => {
      if (done) await uncompleteTask(task.id)
      else await completeTask(task.id)
    })
  }

  const moveTo = (bucket: GtdBucket) => {
    setMenuOpen(false)
    startTransition(async () => { await moveTaskBucket(task.id, bucket) })
  }

  const remove = () => {
    setMenuOpen(false)
    startTransition(async () => { await deleteTask(task.id, task.project_id ?? '') })
  }

  if (done && !showDone) return null

  return (
    <div className={`group flex items-start gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-900/40 transition-colors ${completing ? 'opacity-50' : ''}`}>
      {/* Checkbox */}
      <button
        onClick={toggle}
        className={`mt-0.5 shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors ${
          done ? 'bg-green-700 border-green-700' : 'border-gray-600 hover:border-gray-400'
        }`}
      >
        {done && <span className="text-white text-xs leading-none">✓</span>}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm leading-snug ${done ? 'line-through text-gray-600' : 'text-white'}`}>
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
  showDone: boolean
}

function BucketSection({ bucket, tasks, projects, entities, showDone }: BucketSectionProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [adding, setAdding] = useState(false)

  const visible = showDone ? tasks : tasks.filter(t => t.status !== 'done')
  const doneCount = tasks.filter(t => t.status === 'done').length

  return (
    <div className={`rounded-xl border ${bucket.accent} mb-4`}>
      {/* Header */}
      <button
        onClick={() => setCollapsed(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <span className={`text-xs font-bold uppercase tracking-widest ${bucket.color}`}>{bucket.label}</span>
        <span className="text-xs text-gray-600">{visible.length}{doneCount > 0 && !showDone ? ` · ${doneCount} done` : ''}</span>
        <span className={`ml-auto text-gray-700 text-xs transition-transform ${collapsed ? '' : 'rotate-90'}`}>▶</span>
      </button>

      {!collapsed && (
        <div className="px-2 pb-2">
          {visible.length === 0 && !adding && (
            <p className="px-3 py-2 text-xs text-gray-700 italic">
              {bucket.id === 'today' ? 'Nothing for today — nice.' : 'Empty.'}
            </p>
          )}
          {tasks.map(t => <TaskRow key={t.id} task={t} showDone={showDone} />)}
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
  const [showDone, setShowDone] = useState(false)
  const [filterEntity, setFilterEntity] = useState<string>('all')
  const [addingQuick, setAddingQuick] = useState(false)

  const filtered = filterEntity === 'all'
    ? tasks
    : tasks.filter(t => t.entities?.type === filterEntity || t.projects?.entity_id === entities.find(e => e.type === filterEntity)?.id)

  const byBucket = (bucket: GtdBucket) => filtered.filter(t => t.gtd_bucket === bucket)

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Tasks</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {tasks.filter(t => t.status !== 'done').length} open · {tasks.filter(t => t.status === 'done').length} done
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Entity filter */}
          <div className="flex items-center rounded-lg border border-gray-800 bg-gray-900 p-1 gap-1">
            <button
              onClick={() => setFilterEntity('all')}
              className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${filterEntity === 'all' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >All</button>
            {entities.map(e => (
              <button
                key={e.id}
                onClick={() => setFilterEntity(e.type)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${filterEntity === e.type ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: e.color }} />
                {ENTITY_LABELS[e.type] ?? e.name}
              </button>
            ))}
          </div>
          {/* Show done toggle */}
          <button
            onClick={() => setShowDone(o => !o)}
            className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${showDone ? 'border-gray-600 text-gray-300 bg-gray-800' : 'border-gray-800 text-gray-600 hover:text-gray-400'}`}
          >
            {showDone ? 'Hide done' : 'Show done'}
          </button>
          <button
            onClick={() => setAddingQuick(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            <span className="text-sm leading-none">+</span> New Task
          </button>
        </div>
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
          showDone={showDone}
        />
      ))}
    </div>
  )
}

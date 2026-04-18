'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ProjectStatusBadge, ProjectPriorityBadge } from './ProjectStatusBadge'
import { ProjectCreateDialog } from './ProjectCreateDialog'
import { createTask, updateTask, deleteTask } from '@/app/api/tasks/actions'
import { archiveProject } from '@/app/api/projects/actions'
import type { Database, TaskStatus, ProjectPriority } from '@/types/supabase'

type Project = Database['public']['Tables']['projects']['Row']
type Task = Database['public']['Tables']['tasks']['Row']
type Entity = Database['public']['Tables']['entities']['Row']

const ENTITY_LABELS: Record<string, string> = { tm: 'Triplemeter', sf: 'Streich Force', personal: 'Personal' }

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'done', 'parked']
const STATUS_LABEL: Record<TaskStatus, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done', parked: 'Parked' }
const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'bg-gray-800 text-gray-400',
  in_progress: 'bg-indigo-900/60 text-indigo-300',
  done: 'bg-green-900/60 text-green-300',
  parked: 'bg-yellow-900/60 text-yellow-300',
}

interface Props {
  project: Project
  tasks: Task[]
  entity?: Entity
  entities: Entity[]
}

export function ProjectDetail({ project, tasks: initialTasks, entity, entities }: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [tasks, setTasks] = useState(initialTasks)
  const [newTitle, setNewTitle] = useState('')
  const [isPending, startTransition] = useTransition()
  const [archiving, setArchiving] = useState(false)

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return
    const title = newTitle.trim()
    setNewTitle('')
    startTransition(async () => {
      await createTask({ project_id: project.id, entity_id: project.entity_id, title })
      router.refresh()
    })
  }

  const handleStatusCycle = (task: Task) => {
    const next: Record<TaskStatus, TaskStatus> = { todo: 'in_progress', in_progress: 'done', done: 'todo', parked: 'todo' }
    const nextStatus = next[task.status]
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: nextStatus } : t))
    startTransition(async () => {
      await updateTask(task.id, project.id, { status: nextStatus })
    })
  }

  const handleDelete = (task: Task) => {
    setTasks(ts => ts.filter(t => t.id !== task.id))
    startTransition(async () => {
      await deleteTask(task.id, project.id)
    })
  }

  const handleArchive = async () => {
    if (!confirm('Archive this project? It will be hidden from the main list.')) return
    setArchiving(true)
    await archiveProject(project.id)
    router.push('/dashboard/projects')
  }

  const isOverdue = project.due_date && new Date(project.due_date) < new Date() && project.status !== 'complete'

  const grouped = STATUS_ORDER.map(status => ({
    status,
    tasks: tasks.filter(t => t.status === status),
  })).filter(g => g.tasks.length > 0)

  return (
    <>
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-600 mb-6">
          <Link href="/dashboard/projects" className="hover:text-gray-400 transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-gray-400">{project.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap mb-2">
              {entity && (
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: entity.color }} />
                  {ENTITY_LABELS[entity.type] ?? entity.name}
                </span>
              )}
              <ProjectStatusBadge status={project.status} />
              <ProjectPriorityBadge priority={project.priority} />
            </div>
            <h1 className="text-2xl font-bold text-white leading-tight">{project.name}</h1>
            {project.phase && <p className="mt-1 text-sm text-gray-500">Phase: {project.phase}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setEditOpen(true)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:border-gray-500 transition-colors">
              Edit
            </button>
            <button onClick={handleArchive} disabled={archiving}
              className="rounded-lg border border-gray-800 px-3 py-1.5 text-sm text-gray-600 hover:text-red-400 hover:border-red-900 transition-colors">
              Archive
            </button>
          </div>
        </div>

        {/* Meta row */}
        {project.due_date && (
          <div className={`inline-flex items-center gap-1.5 text-xs mb-4 ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
            <span>{isOverdue ? '⚠ Overdue ·' : 'Due'}</span>
            <span>{new Date(project.due_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
          </div>
        )}

        {/* Description */}
        {project.description && (
          <p className="text-sm text-gray-400 leading-relaxed mb-6 max-w-2xl">{project.description}</p>
        )}

        {/* Next action */}
        {project.next_action && (
          <div className="rounded-xl bg-indigo-950/40 border border-indigo-900/40 px-4 py-3 mb-6">
            <p className="text-xs font-medium text-indigo-400 mb-0.5">Next action</p>
            <p className="text-sm text-gray-300">{project.next_action}</p>
          </div>
        )}

        {/* Tasks section */}
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-white">Tasks <span className="text-gray-600 font-normal text-sm ml-1">{tasks.length}</span></h2>
          </div>

          {/* Add task form */}
          <form onSubmit={handleAddTask} className="flex gap-2 mb-5">
            <input
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Add a task…"
              className="flex-1 rounded-lg bg-gray-900 px-3 py-2 text-sm text-white ring-1 ring-gray-700 focus:ring-indigo-500 outline-none transition-all placeholder:text-gray-600"
            />
            <button type="submit" disabled={!newTitle.trim() || isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
              Add
            </button>
          </form>

          {/* Task groups */}
          {tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-12">
              <p className="text-gray-500 text-sm">No tasks yet — add one above</p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map(({ status, tasks: groupTasks }) => (
                <div key={status}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[status]}`}>{STATUS_LABEL[status]}</span>
                    <span className="text-xs text-gray-700">{groupTasks.length}</span>
                  </div>
                  <div className="space-y-1">
                    {groupTasks.map(task => (
                      <div key={task.id}
                        className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-900 transition-colors">
                        <button onClick={() => handleStatusCycle(task)}
                          className={`w-4 h-4 rounded-full border flex-shrink-0 transition-colors ${
                            task.status === 'done' ? 'bg-green-600 border-green-600' :
                            task.status === 'in_progress' ? 'border-indigo-500 bg-indigo-900/40' :
                            'border-gray-700 hover:border-gray-500'
                          }`} />
                        <span className={`flex-1 text-sm ${task.status === 'done' ? 'line-through text-gray-600' : 'text-gray-300'}`}>
                          {task.title}
                        </span>
                        {task.due_date && (
                          <span className="text-xs text-gray-600 hidden group-hover:block">
                            {new Date(task.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        <button onClick={() => handleDelete(task)}
                          className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-400 transition-all text-sm leading-none">
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ProjectCreateDialog open={editOpen} onClose={() => setEditOpen(false)} entities={entities} project={project} />
    </>
  )
}

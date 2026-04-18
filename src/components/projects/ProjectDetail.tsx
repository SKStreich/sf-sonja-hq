'use client'
import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ProjectStatusBadge, ProjectPriorityBadge } from './ProjectStatusBadge'
import { ProjectCreateDialog } from './ProjectCreateDialog'
import { createTask, updateTask, deleteTask } from '@/app/api/tasks/actions'
import { archiveProject, addProjectUpdate, deleteProjectUpdate, saveProjectFile, deleteProjectFile } from '@/app/api/projects/actions'
import { createClient } from '@/lib/supabase/client'
import type { Database, TaskStatus } from '@/types/supabase'

type Project = Database['public']['Tables']['projects']['Row'] & {
  next_action_type?: string | null
  next_action_due?: string | null
}
type Task = Database['public']['Tables']['tasks']['Row']
type Entity = Database['public']['Tables']['entities']['Row']

interface ProjectUpdate {
  id: string
  content: string
  update_type: string
  user_id: string
  created_at: string
}

interface ProjectFile {
  id: string
  filename: string
  storage_path: string
  file_size: number | null
  content_type: string | null
  created_at: string
}

const ENTITY_LABELS: Record<string, string> = {
  tm: 'Triplemeter',
  sf: 'SF Solutions',
  sfe: 'SF Enterprises',
  personal: 'Personal',
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  meeting: 'Set Meeting', call: 'Schedule Call', email: 'Send Email',
  create_file: 'Create File', review: 'Review', design: 'Design',
  deploy: 'Deploy', research: 'Research', other: 'Other',
}

const STATUS_ORDER: TaskStatus[] = ['todo', 'in_progress', 'done', 'parked']
const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To Do', in_progress: 'In Progress', done: 'Done', parked: 'Parked',
}
const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: 'bg-gray-800 text-gray-400',
  in_progress: 'bg-indigo-900/60 text-indigo-300',
  done: 'bg-green-900/60 text-green-300',
  parked: 'bg-yellow-900/60 text-yellow-300',
}

const UPDATE_TYPE_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
  note:      { label: 'Note',      color: 'text-gray-400',   dot: 'bg-gray-600' },
  progress:  { label: 'Progress',  color: 'text-green-400',  dot: 'bg-green-500' },
  blocker:   { label: 'Blocker',   color: 'text-red-400',    dot: 'bg-red-500' },
  decision:  { label: 'Decision',  color: 'text-indigo-400', dot: 'bg-indigo-500' },
  milestone: { label: 'Milestone', color: 'text-yellow-400', dot: 'bg-yellow-500' },
}

const SECTION_LABEL = 'text-xs font-medium uppercase tracking-wider text-gray-500 mb-3'

interface Props {
  project: Project
  tasks: Task[]
  updates: ProjectUpdate[]
  files: ProjectFile[]
  entity?: Entity
  entities: Entity[]
}

export function ProjectDetail({ project, tasks: initialTasks, updates: initialUpdates, files: initialFiles, entity, entities }: Props) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [tasks, setTasks] = useState(initialTasks)
  const [updates, setUpdates] = useState(initialUpdates)
  const [files, setFiles] = useState(initialFiles)
  const [newTask, setNewTask] = useState('')
  const [newUpdate, setNewUpdate] = useState('')
  const [updateType, setUpdateType] = useState('note')
  const [activeTab, setActiveTab] = useState<'tasks' | 'log' | 'files'>('tasks')
  const [isPending, startTransition] = useTransition()
  const [archiving, setArchiving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Overdue checks
  const projectOverdue = project.due_date && new Date(project.due_date) < new Date() && project.status !== 'complete'
  const nextActionOverdue = (project as any).next_action_due &&
    new Date((project as any).next_action_due + 'T23:59:59') < new Date() &&
    project.status !== 'complete'

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTask.trim()) return
    const title = newTask.trim()
    setNewTask('')
    startTransition(async () => {
      await createTask({ project_id: project.id, entity_id: project.entity_id, title })
      router.refresh()
    })
  }

  const handleStatusCycle = (task: Task) => {
    const next: Record<TaskStatus, TaskStatus> = { todo: 'in_progress', in_progress: 'done', done: 'todo', parked: 'todo' }
    const nextStatus = next[task.status]
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, status: nextStatus } : t))
    startTransition(async () => { await updateTask(task.id, project.id, { status: nextStatus }) })
  }

  const handleDeleteTask = (task: Task) => {
    setTasks(ts => ts.filter(t => t.id !== task.id))
    startTransition(async () => { await deleteTask(task.id, project.id) })
  }

  const handleAddUpdate = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newUpdate.trim()) return
    const content = newUpdate.trim()
    const type = updateType
    setNewUpdate('')
    startTransition(async () => {
      await addProjectUpdate(project.id, content, type)
      router.refresh()
    })
  }

  const handleDeleteUpdate = (id: string) => {
    setUpdates(us => us.filter(u => u.id !== id))
    startTransition(async () => { await deleteProjectUpdate(id, project.id) })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const path = `${user.id}/${project.id}/${Date.now()}-${file.name}`
      const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file)
      if (uploadError) throw uploadError
      await saveProjectFile(project.id, {
        filename: file.name,
        storage_path: path,
        file_size: file.size,
        content_type: file.type,
      })
      router.refresh()
    } catch (err) {
      console.error('Upload failed:', err)
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleDeleteFile = async (file: ProjectFile) => {
    setFiles(fs => fs.filter(f => f.id !== file.id))
    startTransition(async () => {
      await deleteProjectFile(file.id, file.storage_path, project.id)
    })
  }

  const handleDownload = async (file: ProjectFile) => {
    const supabase = createClient()
    const { data } = await supabase.storage.from('project-files').createSignedUrl(file.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const handleArchive = async () => {
    if (!confirm('Archive this project? It will be hidden from the main list.')) return
    setArchiving(true)
    await archiveProject(project.id)
    router.push('/dashboard/projects')
  }

  const grouped = STATUS_ORDER.map(status => ({
    status,
    tasks: tasks.filter(t => t.status === status),
  })).filter(g => g.tasks.length > 0)

  const formatDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const tabCls = (t: string) =>
    `px-3 py-1.5 text-xs font-medium uppercase tracking-wider transition-colors rounded-md ${
      activeTab === t ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
    }`

  const inputCls = 'w-full rounded-lg bg-gray-900 px-3 py-2 text-sm text-white ring-1 ring-gray-700 focus:ring-indigo-500 outline-none transition-all placeholder:text-gray-600'

  return (
    <>
      <div className="mx-auto max-w-3xl px-6 py-8">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-6 uppercase tracking-wider">
          <Link href="/dashboard/projects" className="hover:text-gray-400 transition-colors">Projects</Link>
          <span>/</span>
          <span className="text-gray-500">{project.name}</span>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-2">
              {entity && (
                <span className="flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entity.color ?? '#6366f1' }} />
                  {ENTITY_LABELS[entity.type] ?? entity.name}
                </span>
              )}
              <ProjectStatusBadge status={project.status} />
              <ProjectPriorityBadge priority={project.priority} />
              {project.phase && (
                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs text-gray-400">{project.phase}</span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-white leading-tight">{project.name}</h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setEditOpen(true)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-gray-400 hover:text-white hover:border-gray-500 transition-colors">
              Edit
            </button>
            <button onClick={handleArchive} disabled={archiving}
              className="rounded-lg border border-gray-800 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-gray-600 hover:text-red-400 hover:border-red-900 transition-colors">
              Archive
            </button>
          </div>
        </div>

        {/* Due date */}
        {project.due_date && (
          <p className={`text-xs mb-4 ${projectOverdue ? 'text-red-400' : 'text-gray-500'}`}>
            {projectOverdue ? '⚠ Overdue · ' : 'Due '}
            {formatDate(project.due_date)}
          </p>
        )}

        {/* Description */}
        {project.description && (
          <p className="text-sm text-gray-400 leading-relaxed mb-5 max-w-2xl">{project.description}</p>
        )}

        {/* Next Action */}
        {project.next_action && (
          <div className={`rounded-xl px-4 py-3 mb-6 ${nextActionOverdue ? 'bg-red-950/40 border border-red-900/40' : 'bg-indigo-950/40 border border-indigo-900/40'}`}>
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2">
                <p className={`text-xs font-medium uppercase tracking-wider ${nextActionOverdue ? 'text-red-400' : 'text-indigo-400'}`}>
                  Next Action
                </p>
                {(project as any).next_action_type && (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${nextActionOverdue ? 'bg-red-900/50 text-red-300' : 'bg-indigo-900/50 text-indigo-300'}`}>
                    {ACTION_TYPE_LABELS[(project as any).next_action_type] ?? (project as any).next_action_type}
                  </span>
                )}
              </div>
              {(project as any).next_action_due && (
                <span className={`text-xs ${nextActionOverdue ? 'text-red-400 font-medium' : 'text-gray-500'}`}>
                  {nextActionOverdue ? '⚠ ' : ''}{formatDate((project as any).next_action_due)}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-300">{project.next_action}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 mb-5 border-b border-gray-800 pb-3">
          <button className={tabCls('tasks')} onClick={() => setActiveTab('tasks')}>
            Tasks <span className="ml-1 text-gray-600">{tasks.length}</span>
          </button>
          <button className={tabCls('log')} onClick={() => setActiveTab('log')}>
            Log <span className="ml-1 text-gray-600">{updates.length}</span>
          </button>
          <button className={tabCls('files')} onClick={() => setActiveTab('files')}>
            Files <span className="ml-1 text-gray-600">{files.length}</span>
          </button>
        </div>

        {/* ── TASKS TAB ── */}
        {activeTab === 'tasks' && (
          <div>
            <form onSubmit={handleAddTask} className="flex gap-2 mb-5">
              <input value={newTask} onChange={e => setNewTask(e.target.value)}
                placeholder="Add a task…" className={inputCls} />
              <button type="submit" disabled={!newTask.trim() || isPending}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors shrink-0">
                Add
              </button>
            </form>

            {tasks.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-12">
                <p className="text-sm text-gray-500">No tasks yet — add one above</p>
              </div>
            ) : (
              <div className="space-y-5">
                {grouped.map(({ status, tasks: groupTasks }) => (
                  <div key={status}>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLOR[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                      <span className="text-xs text-gray-700">{groupTasks.length}</span>
                    </div>
                    <div className="space-y-0.5">
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
                          <button onClick={() => handleDeleteTask(task)}
                            className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-400 transition-all text-base leading-none">
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
        )}

        {/* ── LOG TAB ── */}
        {activeTab === 'log' && (
          <div>
            <form onSubmit={handleAddUpdate} className="mb-5 space-y-2">
              <div className="flex gap-2">
                <select value={updateType} onChange={e => setUpdateType(e.target.value)}
                  className="rounded-lg bg-gray-900 px-3 py-2 text-xs font-medium uppercase tracking-wider text-gray-400 ring-1 ring-gray-700 focus:ring-indigo-500 outline-none transition-all shrink-0">
                  {Object.entries(UPDATE_TYPE_CONFIG).map(([v, c]) => (
                    <option key={v} value={v}>{c.label}</option>
                  ))}
                </select>
                <input value={newUpdate} onChange={e => setNewUpdate(e.target.value)}
                  placeholder="Add a note, progress update, blocker…" className={inputCls} />
                <button type="submit" disabled={!newUpdate.trim() || isPending}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors shrink-0">
                  Post
                </button>
              </div>
            </form>

            {updates.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-12">
                <p className="text-sm text-gray-500">No updates yet — add the first one above</p>
              </div>
            ) : (
              <div className="relative pl-4 border-l border-gray-800 space-y-4">
                {updates.map(update => {
                  const cfg = UPDATE_TYPE_CONFIG[update.update_type] ?? UPDATE_TYPE_CONFIG.note
                  return (
                    <div key={update.id} className="group relative">
                      <div className={`absolute -left-[1.3125rem] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${cfg.dot}`} />
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium uppercase tracking-wider ${cfg.color}`}>{cfg.label}</span>
                            <span className="text-xs text-gray-700">
                              {new Date(update.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {' · '}
                              {new Date(update.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-300 leading-relaxed">{update.content}</p>
                        </div>
                        <button onClick={() => handleDeleteUpdate(update.id)}
                          className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-400 transition-all text-base leading-none shrink-0 mt-0.5">
                          ×
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── FILES TAB ── */}
        {activeTab === 'files' && (
          <div>
            <div className="mb-5">
              <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden"
                accept=".jpg,.jpeg,.png,.gif,.webp,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.zip" />
              <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                className="flex items-center gap-2 rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-400 hover:text-white hover:border-gray-500 disabled:opacity-50 transition-colors">
                {uploading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-gray-600 border-t-indigo-500 rounded-full animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Upload File
                  </>
                )}
              </button>
              <p className="mt-1.5 text-xs text-gray-700">PDF, Word, Excel, images, CSV, ZIP · max 50 MB</p>
            </div>

            {files.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-12">
                <p className="text-sm text-gray-500">No files attached yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {files.map(file => (
                  <div key={file.id}
                    className="group flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-gray-900 transition-colors">
                    <div className="w-8 h-8 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-300 truncate">{file.filename}</p>
                      <p className="text-xs text-gray-600">
                        {formatFileSize(file.file_size)}
                        {file.file_size ? ' · ' : ''}
                        {new Date(file.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => handleDownload(file)}
                        className="text-xs text-gray-500 hover:text-indigo-400 transition-colors font-medium uppercase tracking-wider">
                        Download
                      </button>
                      <button onClick={() => handleDeleteFile(file)}
                        className="text-gray-700 hover:text-red-400 transition-colors text-base leading-none">
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <ProjectCreateDialog open={editOpen} onClose={() => setEditOpen(false)} entities={entities} project={project} />
    </>
  )
}

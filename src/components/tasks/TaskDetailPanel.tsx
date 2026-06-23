'use client'
import { useState, useEffect, useRef, useTransition } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { addTaskNote, deleteTaskNote, saveTaskFile, deleteTaskFile, completeTask, cancelTask, reopenTask, reassignTaskProject } from '@/app/api/tasks/actions'
import { assignTask } from '@/app/api/members/actions'
import { createProject } from '@/app/api/projects/actions'
import {
  searchAttachableEntries, attachEntryToTask, detachEntry, getTaskAttachments,
  type AttachTarget, type TaskAttachment,
} from '@/app/api/knowledge/links'
import { entityLabel } from '@/lib/entities/config'

interface TaskNote {
  id: string
  content: string
  created_at: string
}

interface TaskFile {
  id: string
  filename: string
  storage_path: string
  file_size: number | null
  content_type: string | null
  created_at: string
}

interface Task {
  id: string
  title: string
  status: string
  priority: string
  gtd_bucket: string
  due_date: string | null
  assignee_id?: string | null
  projects?: { id: string; name: string } | null
  entities?: { name: string; type: string } | null
}

interface OrgMember { id: string; full_name: string | null; email: string }
interface ProjectOption { id: string; name: string }
interface EntityOption { id: string; name: string; type: string }


interface Props {
  task: Task
  onClose: () => void
  members?: OrgMember[]
  projects?: ProjectOption[]
  entities?: EntityOption[]
}

function fmt(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

const STATUS_COLORS: Record<string, string> = {
  todo: 'text-gray-500', in_progress: 'text-blue-600',
  done: 'text-green-600', cancelled: 'text-red-500', parked: 'text-amber-600',
}
const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-orange-400', low: 'bg-gray-400',
}
const BUCKET_LABELS: Record<string, string> = {
  today: 'Today', this_week: 'This Week', backlog: 'Backlog', someday: 'Someday',
}

export function TaskDetailPanel({ task, onClose, members = [], projects = [], entities = [] }: Props) {
  const [tab, setTab] = useState<'notes' | 'files' | 'docs'>('notes')
  const [notes, setNotes] = useState<TaskNote[]>([])
  const [files, setFiles] = useState<TaskFile[]>([])
  const [docs, setDocs] = useState<TaskAttachment[] | null>(null)
  const [noteText, setNoteText] = useState('')
  const [uploading, setUploading] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(true)
  const [loadingFiles, setLoadingFiles] = useState(true)
  const [pending, startTransition] = useTransition()
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const sb = createClient()
    setLoadingNotes(true)
    ;(sb as any).from('task_notes')
      .select('*').eq('task_id', task.id).order('created_at', { ascending: false })
      .then(({ data }: any) => { setNotes(data ?? []); setLoadingNotes(false) })
    setLoadingFiles(true)
    ;(sb as any).from('task_files')
      .select('*').eq('task_id', task.id).order('created_at', { ascending: false })
      .then(({ data }: any) => { setFiles(data ?? []); setLoadingFiles(false) })
    setDocs(null)
    getTaskAttachments(task.id).then(setDocs).catch(() => setDocs([]))
  }, [task.id])

  const handleAddNote = () => {
    if (!noteText.trim()) return
    const optimistic: TaskNote = { id: 'temp', content: noteText.trim(), created_at: new Date().toISOString() }
    setNotes(n => [optimistic, ...n])
    const text = noteText.trim()
    setNoteText('')
    startTransition(async () => {
      await addTaskNote(task.id, text)
      const sb = createClient()
      const { data } = await (sb as any).from('task_notes').select('*').eq('task_id', task.id).order('created_at', { ascending: false })
      setNotes(data ?? [])
    })
  }

  const handleDeleteNote = (id: string) => {
    setNotes(n => n.filter(x => x.id !== id))
    startTransition(async () => { await deleteTaskNote(id) })
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const sb = createClient()
      const { data: { user } } = await sb.auth.getUser()
      if (!user) return
      const path = `tasks/${task.id}/${Date.now()}-${file.name}`
      const { error } = await sb.storage.from('project-files').upload(path, file)
      if (error) throw error
      await saveTaskFile(task.id, { filename: file.name, storage_path: path, file_size: file.size, content_type: file.type })
      const { data } = await (sb as any).from('task_files').select('*').eq('task_id', task.id).order('created_at', { ascending: false })
      setFiles(data ?? [])
    } catch (err) { console.error(err) }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = '' }
  }

  const handleDownload = async (f: TaskFile) => {
    const sb = createClient()
    const { data } = await sb.storage.from('project-files').createSignedUrl(f.storage_path, 60)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }

  const handleDeleteFile = (f: TaskFile) => {
    setFiles(fs => fs.filter(x => x.id !== f.id))
    startTransition(async () => { await deleteTaskFile(f.id, f.storage_path) })
  }

  const handleStatusAction = (action: 'complete' | 'cancel' | 'reopen') => {
    startTransition(async () => {
      if (action === 'complete') await completeTask(task.id)
      else if (action === 'cancel') await cancelTask(task.id)
      else await reopenTask(task.id)
      onClose()
    })
  }

  const [assigneeId, setAssigneeId] = useState(task.assignee_id ?? null)
  const [assigning, startAssign] = useTransition()

  const handleAssign = (userId: string | null) => {
    setAssigneeId(userId)
    startAssign(() => assignTask(task.id, userId))
  }

  const [projectId, setProjectId] = useState<string | null>(task.projects?.id ?? null)
  const [projectName, setProjectName] = useState<string>(task.projects?.name ?? '')
  const [reassigning, startReassign] = useTransition()
  const [newProjectOpen, setNewProjectOpen] = useState(false)
  const [newProjectName, setNewProjectName] = useState('')
  const [newProjectEntityId, setNewProjectEntityId] = useState(entities[0]?.id ?? '')
  const [creatingProject, startCreateProject] = useTransition()

  const handleReassignProject = (newId: string | null) => {
    const oldId = projectId
    setProjectId(newId)
    setProjectName(projects.find(p => p.id === newId)?.name ?? '')
    startReassign(() => reassignTaskProject(task.id, newId, oldId))
  }

  const handleCreateAndAssign = () => {
    if (!newProjectName.trim() || !newProjectEntityId) return
    startCreateProject(async () => {
      const { id } = await createProject({
        name: newProjectName.trim(),
        entity_id: newProjectEntityId,
        status: 'active',
        priority: 'medium',
      })
      await reassignTaskProject(task.id, id, projectId)
      setProjectId(id)
      setProjectName(newProjectName.trim())
      setNewProjectName('')
      setNewProjectOpen(false)
    })
  }

  const isDone = task.status === 'done'
  const isCancelled = task.status === 'cancelled'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-white border-l border-gray-200 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-200">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{BUCKET_LABELS[task.gtd_bucket]}</p>
            <h2 className={`text-base font-semibold leading-snug ${isDone ? 'line-through text-gray-400' : isCancelled ? 'line-through text-red-400/70' : 'text-gray-900'}`}>
              {task.title}
            </h2>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`text-xs font-medium ${STATUS_COLORS[task.status] ?? 'text-gray-500'}`}>{task.status.replace('_', ' ')}</span>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[task.priority] ?? 'bg-gray-400'}`} />
                {task.priority}
              </span>
              {task.due_date && <span className="text-xs text-gray-500">Due {new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
              {task.projects && <span className="text-xs text-indigo-600">{task.projects.name}</span>}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none mt-0.5">✕</button>
        </div>

        {/* Status actions */}
        <div className="flex gap-2 px-5 py-3 border-b border-gray-200">
          {!isDone && !isCancelled && (
            <button onClick={() => handleStatusAction('complete')} disabled={pending}
              className="flex-1 rounded-md border border-green-300 bg-green-50 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100 transition-colors disabled:opacity-40">
              ✓ Mark Done
            </button>
          )}
          {!isCancelled && !isDone && (
            <button onClick={() => handleStatusAction('cancel')} disabled={pending}
              className="flex-1 rounded-md border border-red-200 bg-red-50 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100 transition-colors disabled:opacity-40">
              ✕ Cancel
            </button>
          )}
          {(isDone || isCancelled) && (
            <button onClick={() => handleStatusAction('reopen')} disabled={pending}
              className="flex-1 rounded-md border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-40">
              ↩ Reopen
            </button>
          )}
        </div>

        {/* Project */}
        <div className="px-5 py-2.5 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 shrink-0 w-14">Project</span>
            <select
              value={projectId ?? ''}
              onChange={e => {
                if (e.target.value === '__new__') {
                  setNewProjectOpen(true)
                } else {
                  handleReassignProject(e.target.value || null)
                }
              }}
              disabled={reassigning || creatingProject}
              className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none"
            >
              <option value="">No project</option>
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
              <option value="__new__">＋ New project…</option>
            </select>
          </div>

          {/* Mini new-project form */}
          {newProjectOpen && (
            <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 space-y-2">
              <p className="text-xs font-medium text-indigo-600">New project</p>
              <input
                autoFocus
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateAndAssign(); if (e.key === 'Escape') setNewProjectOpen(false) }}
                placeholder="Project name…"
                className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400"
              />
              {entities.length > 1 && (
                <select
                  value={newProjectEntityId}
                  onChange={e => setNewProjectEntityId(e.target.value)}
                  className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none"
                >
                  {entities.map(e => (
                    <option key={e.id} value={e.id}>{entityLabel(e.type)}</option>
                  ))}
                </select>
              )}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => { setNewProjectOpen(false); setNewProjectName('') }}
                  className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
                >Cancel</button>
                <button
                  onClick={handleCreateAndAssign}
                  disabled={!newProjectName.trim() || creatingProject}
                  className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                >{creatingProject ? 'Creating…' : 'Create & assign'}</button>
              </div>
            </div>
          )}
        </div>

        {/* Assignee */}
        {members.length > 0 && (
          <div className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-200">
            <span className="text-xs text-gray-500 shrink-0 w-14">Assignee</span>
            <select
              value={assigneeId ?? ''}
              onChange={e => handleAssign(e.target.value || null)}
              disabled={assigning}
              className="flex-1 rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 outline-none"
            >
              <option value="">Unassigned</option>
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.full_name ?? m.email}</option>
              ))}
            </select>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-gray-200 px-5">
          {(['notes', 'files', 'docs'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2.5 mr-4 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-indigo-500 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
              {t} ({t === 'files' ? files.length : t === 'docs' ? (docs?.length ?? 0) : notes.length})
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'notes' && (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <textarea
                  value={noteText}
                  onChange={e => setNoteText(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddNote() }}
                  placeholder="Add a note… (⌘↵ to save)"
                  rows={3}
                  className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 resize-none"
                />
                <button onClick={handleAddNote} disabled={!noteText.trim() || pending}
                  className="self-end rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
                  Add Note
                </button>
              </div>
              {loadingNotes ? <p className="text-xs text-gray-400 text-center py-4">Loading…</p> : notes.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-4">No notes yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {notes.map(note => (
                    <div key={note.id} className="group rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-400">{new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <button onClick={() => handleDeleteNote(note.id)} className="opacity-0 group-hover:opacity-100 text-xs text-red-500 hover:text-red-700 transition-all">Delete</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'files' && (
            <div className="flex flex-col gap-4">
              <div>
                <input ref={fileInputRef} type="file" onChange={handleFileUpload} className="hidden" />
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="w-full rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors disabled:opacity-40">
                  {uploading ? 'Uploading…' : '+ Attach File'}
                </button>
              </div>
              {loadingFiles ? <p className="text-xs text-gray-400 text-center py-4">Loading…</p> : files.length === 0 ? (
                <p className="text-xs text-gray-400 italic text-center py-4">No files attached.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {files.map(f => (
                    <div key={f.id} className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2.5">
                      <span className="text-lg">📄</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-700 truncate">{f.filename}</p>
                        <p className="text-xs text-gray-400">{fmt(f.file_size)}</p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleDownload(f)} className="text-xs text-indigo-600 hover:text-indigo-500">↓</button>
                        <button onClick={() => handleDeleteFile(f)} className="text-xs text-red-500 hover:text-red-700">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'docs' && (
            <TaskAttachDocs taskId={task.id} attachments={docs} setAttachments={setDocs} />
          )}
        </div>
      </div>
    </>
  )
}

/**
 * "Docs" tab — deliberately pin knowledge entries to this task (and unpin them)
 * via relation='attached'. Task-side mirror of the project AttachDocsBlock.
 * Vault docs are allowed as targets (OQ6) and badged.
 */
function TaskAttachDocs({ taskId, attachments, setAttachments }: {
  taskId: string
  attachments: TaskAttachment[] | null
  setAttachments: React.Dispatch<React.SetStateAction<TaskAttachment[] | null>>
}) {
  const [picking, setPicking] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<AttachTarget[]>([])
  const [busy, startBusy] = useTransition()

  // Debounced search while the picker is open. Empty query returns recent docs.
  useEffect(() => {
    if (!picking) return
    const t = setTimeout(() => {
      searchAttachableEntries(query).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(t)
  }, [query, picking])

  const attachedIds = new Set((attachments ?? []).map(a => a.id))

  const attach = (t: AttachTarget) => {
    if (attachedIds.has(t.id)) { setPicking(false); setQuery('') ; return }
    startBusy(async () => {
      await attachEntryToTask(t.id, taskId)
      const fresh = await getTaskAttachments(taskId)
      setAttachments(fresh)
      setQuery(''); setResults([]); setPicking(false)
    })
  }

  const detach = (linkId: string) => {
    setAttachments(a => a?.filter(x => x.linkId !== linkId) ?? null)
    startBusy(async () => { await detachEntry(linkId) })
  }

  return (
    <div className="flex flex-col gap-4">
      {!picking ? (
        <button onClick={() => { setPicking(true); setResults([]) }}
          className="w-full rounded-lg border border-dashed border-gray-300 py-3 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-400 transition-colors">
          + Attach a document
        </button>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-2">
          <div className="flex items-center gap-2">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search knowledge docs by title…"
              onKeyDown={e => { if (e.key === 'Escape') { setPicking(false); setQuery('') } }}
              className="flex-1 rounded-md border border-gray-200 px-2 py-1.5 text-sm text-gray-900 outline-none focus:border-indigo-400" />
            <button onClick={() => { setPicking(false); setQuery('') }}
              className="text-xs text-gray-500 hover:text-gray-700">Cancel</button>
          </div>
          <ul className="mt-2 max-h-64 overflow-y-auto">
            {results.length === 0 ? (
              <li className="px-2 py-2 text-xs text-gray-400">No matching documents</li>
            ) : results.map(r => {
              const already = attachedIds.has(r.id)
              return (
                <li key={r.id}>
                  <button onClick={() => attach(r)} disabled={busy || already}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50">
                    <span className="flex-1 truncate text-gray-900">{r.title}</span>
                    {r.vault && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">Vault</span>}
                    <span className="text-[10px] uppercase tracking-wider text-gray-400">{r.kind} · {r.entity}</span>
                    {already && <span className="text-[10px] text-gray-400">attached</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {attachments === null ? (
        <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-gray-400 italic text-center py-4">No documents attached — use “+ Attach a document” to pin a knowledge doc to this task.</p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {attachments.map(a => (
            <li key={a.linkId} className="group flex items-center gap-2 py-2">
              <Link href={`/dashboard/knowledge/${a.id}`}
                className="flex flex-1 items-center gap-2 truncate text-sm text-gray-900 hover:text-indigo-700">
                <span className="text-gray-400">📌</span>
                <span className="flex-1 truncate">{a.title || 'Untitled'}</span>
                {a.vault && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-700">Vault</span>}
                <span className="text-[10px] uppercase tracking-wider text-gray-400">{a.kind} · {a.entity}</span>
              </Link>
              <button onClick={() => detach(a.linkId)} disabled={busy}
                title="Detach"
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all text-base leading-none shrink-0">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

'use client'
import { useState, useEffect, useRef, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import { addTaskNote, deleteTaskNote, saveTaskFile, deleteTaskFile, completeTask, cancelTask, reopenTask } from '@/app/api/tasks/actions'

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
  projects?: { id: string; name: string } | null
  entities?: { name: string; type: string } | null
}

interface Props {
  task: Task
  onClose: () => void
}

function fmt(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`
}

const STATUS_COLORS: Record<string, string> = {
  todo: 'text-gray-400', in_progress: 'text-blue-400',
  done: 'text-green-400', cancelled: 'text-red-400', parked: 'text-yellow-400',
}
const PRIORITY_DOT: Record<string, string> = {
  high: 'bg-red-500', medium: 'bg-orange-400', low: 'bg-gray-600',
}
const BUCKET_LABELS: Record<string, string> = {
  today: 'Today', this_week: 'This Week', backlog: 'Backlog', someday: 'Someday',
}

export function TaskDetailPanel({ task, onClose }: Props) {
  const [tab, setTab] = useState<'notes' | 'files'>('notes')
  const [notes, setNotes] = useState<TaskNote[]>([])
  const [files, setFiles] = useState<TaskFile[]>([])
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

  const isDone = task.status === 'done'
  const isCancelled = task.status === 'cancelled'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-md bg-gray-950 border-l border-gray-800 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-800">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-600 uppercase tracking-wider mb-1">{BUCKET_LABELS[task.gtd_bucket]}</p>
            <h2 className={`text-base font-semibold leading-snug ${isDone ? 'line-through text-gray-500' : isCancelled ? 'line-through text-red-400/70' : 'text-white'}`}>
              {task.title}
            </h2>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className={`text-xs font-medium ${STATUS_COLORS[task.status] ?? 'text-gray-500'}`}>{task.status.replace('_', ' ')}</span>
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <span className={`w-1.5 h-1.5 rounded-full ${PRIORITY_DOT[task.priority] ?? 'bg-gray-600'}`} />
                {task.priority}
              </span>
              {task.due_date && <span className="text-xs text-gray-500">Due {new Date(task.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>}
              {task.projects && <span className="text-xs text-indigo-500">{task.projects.name}</span>}
            </div>
          </div>
          <button onClick={onClose} className="shrink-0 text-gray-600 hover:text-gray-400 transition-colors text-lg leading-none mt-0.5">✕</button>
        </div>

        {/* Status actions */}
        <div className="flex gap-2 px-5 py-3 border-b border-gray-800">
          {!isDone && !isCancelled && (
            <button onClick={() => handleStatusAction('complete')} disabled={pending}
              className="flex-1 rounded-md border border-green-800 bg-green-950/40 py-1.5 text-xs font-medium text-green-400 hover:bg-green-900/40 transition-colors disabled:opacity-40">
              ✓ Mark Done
            </button>
          )}
          {!isCancelled && !isDone && (
            <button onClick={() => handleStatusAction('cancel')} disabled={pending}
              className="flex-1 rounded-md border border-red-900 bg-red-950/30 py-1.5 text-xs font-medium text-red-400 hover:bg-red-900/40 transition-colors disabled:opacity-40">
              ✕ Cancel
            </button>
          )}
          {(isDone || isCancelled) && (
            <button onClick={() => handleStatusAction('reopen')} disabled={pending}
              className="flex-1 rounded-md border border-gray-700 py-1.5 text-xs font-medium text-gray-400 hover:bg-gray-800 transition-colors disabled:opacity-40">
              ↩ Reopen
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-800 px-5">
          {(['notes', 'files'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`py-2.5 mr-4 text-sm font-medium border-b-2 transition-colors capitalize ${tab === t ? 'border-indigo-500 text-white' : 'border-transparent text-gray-600 hover:text-gray-400'}`}>
              {t}{t === 'files' ? ` (${files.length})` : ` (${notes.length})`}
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
                  className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-gray-600 resize-none"
                />
                <button onClick={handleAddNote} disabled={!noteText.trim() || pending}
                  className="self-end rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
                  Add Note
                </button>
              </div>
              {loadingNotes ? <p className="text-xs text-gray-600 text-center py-4">Loading…</p> : notes.length === 0 ? (
                <p className="text-xs text-gray-700 italic text-center py-4">No notes yet.</p>
              ) : (
                <div className="flex flex-col gap-3">
                  {notes.map(note => (
                    <div key={note.id} className="group rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2.5">
                      <p className="text-sm text-gray-300 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-700">{new Date(note.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        <button onClick={() => handleDeleteNote(note.id)} className="opacity-0 group-hover:opacity-100 text-xs text-red-600 hover:text-red-400 transition-all">Delete</button>
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
                  className="w-full rounded-lg border border-dashed border-gray-700 py-3 text-sm text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors disabled:opacity-40">
                  {uploading ? 'Uploading…' : '+ Attach File'}
                </button>
              </div>
              {loadingFiles ? <p className="text-xs text-gray-600 text-center py-4">Loading…</p> : files.length === 0 ? (
                <p className="text-xs text-gray-700 italic text-center py-4">No files attached.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {files.map(f => (
                    <div key={f.id} className="group flex items-center gap-3 rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2.5">
                      <span className="text-lg">📄</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-300 truncate">{f.filename}</p>
                        <p className="text-xs text-gray-600">{fmt(f.file_size)}</p>
                      </div>
                      <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleDownload(f)} className="text-xs text-indigo-500 hover:text-indigo-400">↓</button>
                        <button onClick={() => handleDeleteFile(f)} className="text-xs text-red-600 hover:text-red-400">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

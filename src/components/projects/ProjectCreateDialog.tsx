'use client'
import { useState, useTransition } from 'react'
import { createProject, updateProject } from '@/app/api/projects/actions'
import type { Database, ProjectStatus, ProjectPriority } from '@/types/supabase'

type Entity = Database['public']['Tables']['entities']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface Props {
  open: boolean
  onClose: () => void
  entities: Entity[]
  project?: Project
}

const ENTITY_LABELS: Record<string, string> = { tm: 'Triplemeter', sf: 'Streich Force', personal: 'Personal' }
const STATUSES: ProjectStatus[] = ['planning', 'active', 'on_hold', 'complete']
const PRIORITIES: ProjectPriority[] = ['high', 'medium', 'low']

export function ProjectCreateDialog({ open, onClose, entities, project }: Props) {
  const isEdit = !!project
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    entity_id: project?.entity_id ?? entities[0]?.id ?? '',
    name: project?.name ?? '',
    description: project?.description ?? '',
    status: project?.status ?? 'planning' as ProjectStatus,
    priority: project?.priority ?? 'medium' as ProjectPriority,
    phase: project?.phase ?? '',
    next_action: project?.next_action ?? '',
    due_date: project?.due_date ?? '',
  })

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || !form.entity_id) return
    setError(null)
    startTransition(async () => {
      try {
        const payload = {
          entity_id: form.entity_id,
          name: form.name.trim(),
          description: form.description.trim() || null,
          status: form.status,
          priority: form.priority,
          phase: form.phase.trim() || null,
          next_action: form.next_action.trim() || null,
          due_date: form.due_date || null,
        }
        if (isEdit) {
          await updateProject(project.id, payload)
        } else {
          await createProject(payload)
        }
        onClose()
      } catch {
        setError('Something went wrong. Please try again.')
      }
    })
  }

  if (!open) return null

  const inputCls = 'w-full rounded-lg bg-gray-950 px-3 py-2 text-sm text-white ring-1 ring-gray-700 focus:ring-indigo-500 outline-none transition-all'
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1'

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-[10vh] z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4 sticky top-0 bg-gray-900 z-10">
          <h2 className="text-sm font-semibold text-white">{isEdit ? 'Edit Project' : 'New Project'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Project name *</label>
              <input value={form.name} onChange={set('name')} required placeholder="e.g. Sonja HQ Sprint 3"
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Entity *</label>
              <select value={form.entity_id} onChange={set('entity_id')} className={inputCls}>
                {entities.map(e => <option key={e.id} value={e.id}>{ENTITY_LABELS[e.type] ?? e.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={set('status')} className={inputCls}>
                {STATUSES.map(s => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select value={form.priority} onChange={set('priority')} className={inputCls}>
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Due date</label>
              <input type="date" value={form.due_date} onChange={set('due_date')} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Phase</label>
              <input value={form.phase} onChange={set('phase')} placeholder="e.g. Discovery, Build, Launch"
                className={inputCls} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={set('description')} rows={2}
              placeholder="What is this project about?" className={`${inputCls} resize-none`} />
          </div>
          <div>
            <label className={labelCls}>Next action</label>
            <input value={form.next_action} onChange={set('next_action')}
              placeholder="The very next thing to move this forward"
              className={inputCls} />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Cancel</button>
            <button type="submit" disabled={!form.name.trim() || isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-all">
              {isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

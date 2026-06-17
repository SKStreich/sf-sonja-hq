'use client'
import { useState, useTransition } from 'react'
import { createProject, updateProject } from '@/app/api/projects/actions'
import { DatePicker } from './DatePicker'
import { entityLabel } from '@/lib/entities/config'
import { ACTION_TYPES } from '@/lib/tasks/action-types'
import type { Database, ProjectStatus, ProjectPriority } from '@/types/supabase'

type Entity = Database['public']['Tables']['entities']['Row']
type Project = Database['public']['Tables']['projects']['Row']

interface Props {
  open: boolean
  onClose: () => void
  entities: Entity[]
  project?: Project & { next_action_type?: string | null; next_action_due?: string | null }
  /** Full entity-id set for the project being edited (multi-entity pre-selection). */
  initialEntityIds?: string[]
}


const STATUSES: { value: ProjectStatus; label: string }[] = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'complete', label: 'Complete' },
]

const PRIORITIES: { value: ProjectPriority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

const PHASES = [
  'Discovery', 'Planning', 'Design', 'Build', 'Testing', 'Launch', 'Maintenance',
]

export function ProjectCreateDialog({ open, onClose, entities, project, initialEntityIds }: Props) {
  const isEdit = !!project
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [entityIds, setEntityIds] = useState<string[]>(
    initialEntityIds?.length
      ? initialEntityIds
      : entities[0]?.id
        ? [entities[0].id]
        : [],
  )
  const toggleEntity = (id: string) => {
    setEntityIds(ids => {
      if (ids.includes(id)) return ids.length === 1 ? ids : ids.filter(x => x !== id) // keep ≥1
      return [...ids, id]
    })
  }

  const [form, setForm] = useState({
    name: project?.name ?? '',
    description: project?.description ?? '',
    status: (project?.status ?? 'planning') as ProjectStatus,
    priority: (project?.priority ?? 'medium') as ProjectPriority,
    phase: project?.phase ?? '',
    next_action: project?.next_action ?? '',
    next_action_type: (project as any)?.next_action_type ?? '',
    next_action_due: (project as any)?.next_action_due ?? '',
    due_date: project?.due_date ?? '',
  })

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim() || entityIds.length === 0) return
    setError(null)
    startTransition(async () => {
      try {
        const payload = {
          entity_id: entityIds[0],
          entity_ids: entityIds,
          name: form.name.trim(),
          description: form.description.trim() || null,
          status: form.status,
          priority: form.priority,
          phase: form.phase || null,
          next_action: form.next_action.trim() || null,
          next_action_type: form.next_action_type || null,
          next_action_due: form.next_action_due || null,
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

  const inputCls = 'w-full rounded-lg bg-white px-3 py-2 text-sm text-gray-900 ring-1 ring-gray-200 focus:ring-indigo-400 outline-none transition-all'
  const labelCls = 'block text-xs font-medium uppercase tracking-wider text-gray-500 mb-1.5'

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-1/2 top-[5vh] z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl border border-gray-200 bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4 sticky top-0 bg-white z-10">
          <h2 className="text-sm font-semibold text-gray-900">{isEdit ? 'Edit Project' : 'New Project'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className={labelCls}>Project Name *</label>
            <input value={form.name} onChange={set('name')} required
              placeholder="e.g. Sonja HQ Sprint 3" className={inputCls} />
          </div>

          {/* Entities (multi-select) */}
          <div>
            <label className={labelCls}>Entities * <span className="normal-case text-gray-400 font-normal">(one or more)</span></label>
            <div className="flex flex-wrap gap-1.5">
              {entities.map(e => {
                const on = entityIds.includes(e.id)
                return (
                  <button key={e.id} type="button" aria-pressed={on}
                    onClick={() => toggleEntity(e.id)}
                    className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      on ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}>
                    <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: e.color ?? '#6366f1' }} />
                    {entityLabel(e.type)}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <select value={form.status} onChange={set('status')} className={inputCls}>
              {STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Priority + Phase */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Priority</label>
              <select value={form.priority} onChange={set('priority')} className={inputCls}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Phase</label>
              <select value={form.phase} onChange={set('phase')} className={inputCls}>
                <option value="">— None —</option>
                {PHASES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Due Date */}
          <div>
            <label className={labelCls}>Due Date</label>
            <DatePicker value={form.due_date} onChange={v => setForm(f => ({ ...f, due_date: v }))} placeholder="Select due date" className={inputCls} />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea value={form.description} onChange={set('description')} rows={2}
              placeholder="What is this project about?" className={`${inputCls} resize-none`} />
          </div>

          {/* Next Action */}
          <div className="rounded-xl bg-gray-50 p-3 space-y-3 ring-1 ring-gray-200">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Next Action</p>
            <p className="text-xs text-gray-400 -mt-2">Becomes the first task in this project — completable and editable.</p>
            <div>
              <label className={labelCls}>Action Type</label>
              <select value={form.next_action_type} onChange={set('next_action_type')} className={inputCls}>
                <option value="">— Select type —</option>
                {ACTION_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Description</label>
              <input value={form.next_action} onChange={set('next_action')}
                placeholder="What specifically needs to happen?" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Due By</label>
              <DatePicker value={form.next_action_due} onChange={v => setForm(f => ({ ...f, next_action_due: v }))} placeholder="Select action due date" className={inputCls} />
            </div>
          </div>

          {error && <p className="text-red-600 text-xs">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!form.name.trim() || entityIds.length === 0 || isPending}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-all">
              {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}

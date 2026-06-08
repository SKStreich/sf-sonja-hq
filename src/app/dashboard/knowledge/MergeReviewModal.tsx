'use client'
/**
 * Merge review modal (item E, PR 2). Calls `draftMerge` for the AI lossless
 * union, lets you edit title / body / kind / entities / tags before saving, and
 * commits via `commitMerge`. Locked: OQ1 new entry · OQ4 union metadata (you
 * trim here) · OQ5 conflicts surfaced in the body · OQ7 truncation warning.
 */
import { useEffect, useState, useTransition } from 'react'
import { draftMerge, commitMerge, type MergeDraft } from '@/app/api/knowledge/merge'
import type { Entity, Kind } from '@/app/api/knowledge/actions'
import { parseTagList } from '@/lib/knowledge/merge-core'
import { EntityMultiSelect } from '@/components/shared/EntityMultiSelect'
import { ENTITY_SELECT_OPTIONS } from '@/lib/entities/config'

const KIND_OPTIONS: { value: Kind; label: string }[] = [
  { value: 'doc', label: 'Doc' },
  { value: 'note', label: 'Note' },
  { value: 'idea', label: 'Idea' },
  { value: 'chat', label: 'Chat' },
]

interface Props {
  sourceIds: string[]
  onClose: () => void
  onMerged: (newId: string) => void
}

export function MergeReviewModal({ sourceIds, onClose, onMerged }: Props) {
  const [draft, setDraft] = useState<MergeDraft | null>(null)
  const [loadErr, setLoadErr] = useState('')
  const [drafting, startDraft] = useTransition()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<Kind>('doc')
  const [entities, setEntities] = useState<Entity[]>([])
  const [tagsInput, setTagsInput] = useState('')
  const [carryProjects, setCarryProjects] = useState(true)

  const [saving, startSave] = useTransition()
  const [saveErr, setSaveErr] = useState('')

  useEffect(() => {
    let cancelled = false
    startDraft(async () => {
      try {
        const d = await draftMerge(sourceIds)
        if (cancelled) return
        setDraft(d)
        setTitle(d.title)
        setBody(d.body)
        setKind((d.hasWorkspaceSource ? 'doc' : d.kind) as Kind) // workspace handled server-side; select stays a normal kind
        setEntities(d.entities as Entity[])
        setTagsInput(d.tags.join(', '))
      } catch (e: any) {
        if (!cancelled) setLoadErr(e?.message ?? 'Failed to draft the merge')
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = () => {
    if (!draft) return
    if (!body.trim()) { setSaveErr('The merged body cannot be empty.'); return }
    if (entities.length === 0) { setSaveErr('Pick at least one entity.'); return }
    setSaveErr('')
    startSave(async () => {
      try {
        const { id } = await commitMerge({
          sourceIds: draft.sourceIds,
          title,
          body,
          kind: draft.hasWorkspaceSource ? undefined : kind, // workspace forced server-side
          type_hint: draft.type_hint,
          entities,
          tags: parseTagList(tagsInput),
          projectIds: carryProjects ? draft.projectIds : [],
        })
        onMerged(id)
      } catch (e: any) {
        setSaveErr(e?.message ?? 'Failed to save the merge')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/30 p-6">
      <div className="my-4 w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Merge {sourceIds.length} entries
          </h2>
          <button onClick={onClose} className="text-xl text-gray-400 hover:text-gray-600">×</button>
        </div>

        {/* Loading / draft error */}
        {!draft && (
          <div className="px-5 py-10 text-center text-sm text-gray-500">
            {loadErr
              ? <span className="text-red-600">{loadErr}</span>
              : <span>{drafting ? 'Claude is drafting a lossless union…' : 'Preparing…'}</span>}
          </div>
        )}

        {draft && (
          <div className="space-y-4 p-5">
            {/* Sources */}
            <div className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
              <span className="font-semibold uppercase tracking-wider text-gray-400">Merging:</span>{' '}
              {draft.sources.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && ' · '}
                  <span className="text-gray-800">{s.title || '(untitled)'}</span>
                  <span className="text-gray-400"> [{s.kind}]</span>
                </span>
              ))}
              <p className="mt-1 text-[11px] text-gray-400">
                Sources are archived and linked to the new entry — recoverable, never deleted.
              </p>
            </div>

            {draft.truncated && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                ⚠ The combined source text exceeded the size cap and was truncated before drafting.
                Double-check that nothing important is missing from the body below.
              </div>
            )}

            {draft.hasWorkspaceSource && (
              <div className="rounded-md border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-800">
                📄 A workspace page is among the sources, so the merged result will be a <strong>workspace page</strong>
                {' '}and the sources&apos; child pages will be re-parented onto it.
              </div>
            )}

            {/* Title */}
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Title</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-indigo-400"
              />
            </div>

            {/* Body */}
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Merged body (Markdown)</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                rows={16}
                className="w-full rounded-md border border-gray-200 px-3 py-2 font-mono text-sm text-gray-900 outline-none focus:border-indigo-400"
              />
            </div>

            {/* Kind + entities */}
            <div className="flex flex-wrap items-center gap-3">
              {draft.hasWorkspaceSource ? (
                <span className="rounded border border-teal-200 bg-teal-50 px-2 py-1 text-xs font-medium text-teal-800">
                  Kind: Workspace page
                </span>
              ) : (
                <select
                  value={kind}
                  onChange={e => setKind(e.target.value as Kind)}
                  className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                >
                  {KIND_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                </select>
              )}
              <EntityMultiSelect options={ENTITY_SELECT_OPTIONS} selected={entities} onChange={v => setEntities(v as Entity[])} />
            </div>

            {/* Tags */}
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-gray-500">Tags</label>
              <input
                value={tagsInput}
                onChange={e => setTagsInput(e.target.value)}
                placeholder="comma, separated, tags"
                className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm text-gray-900 outline-none focus:border-indigo-400"
              />
            </div>

            {/* Carry projects */}
            {draft.projectIds.length > 0 && (
              <label className="flex items-center gap-2 text-xs text-gray-700">
                <input type="checkbox" checked={carryProjects} onChange={e => setCarryProjects(e.target.checked)} />
                Carry over {draft.projectIds.length} attached project{draft.projectIds.length === 1 ? '' : 's'} from the sources
              </label>
            )}

            {saveErr && <p className="text-xs text-red-600">{saveErr}</p>}

            <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-3">
              <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
              >
                {saving ? 'Saving…' : 'Save merged entry'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

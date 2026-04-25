'use client'
import Link from 'next/link'
import type { KnowledgeEntry } from '@/app/api/knowledge/actions'

const KIND_STYLES: Record<string, string> = {
  idea: 'bg-amber-100 text-amber-800',
  doc: 'bg-blue-100 text-blue-800',
  chat: 'bg-purple-100 text-purple-800',
  note: 'bg-gray-100 text-gray-700',
  critique: 'bg-indigo-100 text-indigo-800',
  vault: 'bg-red-100 text-red-800',
}

const ENTITY_STYLES: Record<string, string> = {
  tm: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sf: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  sfe: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  personal: 'bg-gray-50 text-gray-700 border-gray-200',
}

interface Props {
  entries: KnowledgeEntry[]
  onDelete: (id: string) => void
  onChat?: (entry: KnowledgeEntry) => void
}

export function CardView({ entries, onDelete, onChat }: Props) {
  if (entries.length === 0) {
    return <EmptyState />
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {entries.map(e => (
        <article key={e.id} className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
          <div className="mb-2 flex items-center gap-1.5">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${KIND_STYLES[e.kind] ?? KIND_STYLES.note}`}>
              {e.kind}
            </span>
            <span className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${ENTITY_STYLES[e.entity] ?? ENTITY_STYLES.personal}`}>
              {e.entity}
            </span>
            {e.idea_status && e.idea_status !== 'raw' && (
              <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">{e.idea_status}</span>
            )}
          </div>
          <Link href={`/dashboard/knowledge/${e.id}`} className="mb-1">
            <h3 className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-indigo-700">
              {e.title || '(untitled)'}
            </h3>
          </Link>
          {e.summary && (
            <p className="mb-2 line-clamp-2 text-xs text-gray-500">{e.summary}</p>
          )}
          {e.body && !e.summary && (
            <p className="mb-2 line-clamp-3 text-xs text-gray-600">{e.body}</p>
          )}
          {e.tags.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-1">
              {e.tags.slice(0, 4).map(t => (
                <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">#{t}</span>
              ))}
            </div>
          )}
          <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2 text-[11px] text-gray-400">
            <span>{new Date(e.updated_at).toLocaleDateString()}</span>
            <div className="flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100">
              {onChat && e.kind !== 'chat' && (
                <button
                  onClick={() => onChat(e)}
                  className="font-medium text-indigo-600 hover:text-indigo-500"
                >
                  Chat
                </button>
              )}
              <button
                onClick={() => { if (confirm('Delete this entry?')) onDelete(e.id) }}
                className="hover:text-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </article>
      ))}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
      <p className="text-sm font-medium text-gray-700">No entries yet</p>
      <p className="mt-1 text-xs text-gray-500">Click &quot;+ New entry&quot; to capture your first idea, doc, or note.</p>
    </div>
  )
}

'use client'
import Link from 'next/link'
import type { KnowledgeEntry } from '@/app/api/knowledge/actions'

interface Props {
  entries: KnowledgeEntry[]
  onDelete: (id: string) => void
}

const KIND_DOT: Record<string, string> = {
  idea: 'bg-amber-500',
  doc: 'bg-blue-500',
  chat: 'bg-purple-500',
  note: 'bg-gray-400',
  critique: 'bg-indigo-500',
  vault: 'bg-red-500',
}

export function ListView({ entries, onDelete }: Props) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500">
        No entries match these filters.
      </div>
    )
  }
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            <th className="px-4 py-2 text-left font-semibold">Title</th>
            <th className="px-3 py-2 text-left font-semibold">Kind</th>
            <th className="px-3 py-2 text-left font-semibold">Entity</th>
            <th className="px-3 py-2 text-left font-semibold">Tags</th>
            <th className="px-3 py-2 text-left font-semibold">Updated</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map(e => (
            <tr key={e.id} className="group hover:bg-gray-50">
              <td className="px-4 py-2.5">
                <Link href={`/dashboard/knowledge/${e.id}`} className="block">
                  <div className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[e.kind] ?? KIND_DOT.note}`} />
                    <span className="font-medium text-gray-900 line-clamp-1 hover:text-indigo-700">{e.title || '(untitled)'}</span>
                  </div>
                  {e.summary && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{e.summary}</p>}
                </Link>
              </td>
              <td className="px-3 py-2.5 text-xs uppercase tracking-wide text-gray-600">{e.kind}</td>
              <td className="px-3 py-2.5 text-xs uppercase tracking-wide text-gray-600">{e.entity}</td>
              <td className="px-3 py-2.5 text-xs text-gray-500">
                {e.tags.slice(0, 3).join(', ')}
              </td>
              <td className="px-3 py-2.5 text-xs text-gray-500">
                {new Date(e.updated_at).toLocaleDateString()}
              </td>
              <td className="px-3 py-2.5 text-right">
                <button
                  onClick={() => { if (confirm('Delete this entry?')) onDelete(e.id) }}
                  className="text-xs text-gray-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

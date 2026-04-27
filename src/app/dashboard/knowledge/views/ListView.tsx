'use client'
import Link from 'next/link'
import type { KnowledgeEntry } from '@/app/api/knowledge/actions'

interface Props {
  entries: KnowledgeEntry[]
  onDelete: (id: string) => void
  pendingForwards?: Record<string, number>
}

const KIND_DOT: Record<string, string> = {
  idea: 'bg-amber-500',
  doc: 'bg-blue-500',
  chat: 'bg-purple-500',
  note: 'bg-gray-400',
  critique: 'bg-indigo-500',
  workspace: 'bg-teal-500',
  vault: 'bg-red-500',
}

interface Row { entry: KnowledgeEntry; depth: number }

/**
 * Reorders entries so workspace pages render under their parents (indented),
 * keeping non-workspace entries at the top in their original order. Only
 * applies when both parent and child are present in `entries`.
 */
function buildRows(entries: KnowledgeEntry[]): Row[] {
  const byId = new Map(entries.map(e => [e.id, e]))
  const childrenOf = new Map<string, KnowledgeEntry[]>()
  for (const e of entries) {
    if (e.kind === 'workspace' && e.parent_id && byId.has(e.parent_id)) {
      const arr = childrenOf.get(e.parent_id) ?? []
      arr.push(e)
      childrenOf.set(e.parent_id, arr)
    }
  }
  // Sort children alphabetically inside each group for predictable ordering.
  childrenOf.forEach(list => list.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? '')))

  const rendered = new Set<string>()
  const out: Row[] = []
  const pushSubtree = (e: KnowledgeEntry, depth: number) => {
    if (rendered.has(e.id)) return
    rendered.add(e.id)
    out.push({ entry: e, depth })
    for (const c of childrenOf.get(e.id) ?? []) pushSubtree(c, depth + 1)
  }
  for (const e of entries) {
    if (e.kind === 'workspace' && e.parent_id && byId.has(e.parent_id)) continue // will be rendered under parent
    pushSubtree(e, 0)
  }
  return out
}

export function ListView({ entries, onDelete, pendingForwards = {} }: Props) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center text-sm text-gray-500">
        No entries match these filters.
      </div>
    )
  }
  const rows = buildRows(entries)
  const childCount = new Map<string, number>()
  for (const e of entries) {
    if (e.kind === 'workspace' && e.parent_id) {
      childCount.set(e.parent_id, (childCount.get(e.parent_id) ?? 0) + 1)
    }
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
          {rows.map(({ entry: e, depth }) => (
            <tr key={e.id} className={`group hover:bg-gray-50 ${depth > 0 ? 'bg-gray-50/60' : ''}`}>
              <td className="px-4 py-2.5">
                <Link href={`/dashboard/knowledge/${e.id}`} className="block">
                  <div className="flex items-center gap-2" style={{ paddingLeft: depth * 20 }}>
                    {depth > 0 && <span className="text-gray-300">↳</span>}
                    <span className={`h-1.5 w-1.5 rounded-full ${KIND_DOT[e.kind] ?? KIND_DOT.note}`} />
                    <span className="font-medium text-gray-900 line-clamp-1 hover:text-indigo-700">{e.title || '(untitled)'}</span>
                    {e.kind === 'workspace' && childCount.get(e.id) ? (
                      <span className="ml-1 rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">
                        📄 {childCount.get(e.id)}
                      </span>
                    ) : null}
                    {pendingForwards[e.id] ? (
                      <span title={`${pendingForwards[e.id]} forward request${pendingForwards[e.id] === 1 ? '' : 's'} awaiting approval`}
                        className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">
                        ⚠ {pendingForwards[e.id]}
                      </span>
                    ) : null}
                  </div>
                  {e.summary && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500" style={{ paddingLeft: depth * 20 + 16 }}>{e.summary}</p>}
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

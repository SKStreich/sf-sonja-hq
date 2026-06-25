'use client'
/**
 * Unified Knowledge Browser — the one node renderer (Phase U1).
 *
 * Renders any KnowledgeNode (page / doc / idea / note / chat / database / vault)
 * in Cards or List display. Entry-backed nodes keep every feature from the old
 * CardView/ListView (merge-select, chat, delete, child-page pill, pending
 * forwards, summary/tags/idea-status). Database + vault nodes get their own
 * cards/rows and open via callbacks. This replaces CardView + ListView.
 */
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { EntityChips } from '@/components/shared/EntityChips'
import { AreaChips } from '@/components/shared/AreaChips'
import { EntityMultiSelect } from '@/components/shared/EntityMultiSelect'
import { ENTITY_SELECT_OPTIONS } from '@/lib/entities/config'
import { TYPE_META, type KnowledgeNode } from '@/lib/knowledge/nodes'
import { buildTree, type TreeNode, type NodeEdge } from '@/lib/knowledge/tree'
import { staleStatus } from '@/lib/knowledge/staleness'
import type { KnowledgeEntry } from '@/app/api/knowledge/actions'

interface Props {
  nodes: KnowledgeNode[]
  display: 'cards' | 'list' | 'tree'
  treeLinks?: NodeEdge[]
  pendingForwards?: Record<string, number>
  selectable?: boolean
  selectedIds?: Set<string>
  onToggleSelect?: (id: string) => void
  onChat?: (entry: KnowledgeEntry) => void
  onDelete?: (id: string) => void
  onOpenDatabase?: (id: string) => void
  onOpenVault?: (node: KnowledgeNode) => void
  /** Inbox triage (Sprint 13 T2): file an un-filed entry with ≥1 entity. When
   *  set, inbox cards render an inline entity-picker + File button. */
  onFile?: (id: string, entities: string[]) => Promise<void>
  /** Stale "needs review" queue (Sprint 13 staleness): mark an entry reviewed.
   *  When set, entry cards render an inline "✓ Mark reviewed" bar. */
  onReview?: (id: string) => Promise<void>
  /** Area id → name (Sprint 13 A2), to render an entry's area chips on cards. */
  areaNames?: Record<string, string>
}

/** Hide workspace child pages (shown as a count pill on their parent, reachable
 *  from the parent's detail page) and tally per-parent child counts. Mirrors the
 *  old CardView behaviour, applied uniformly to cards + list. */
function prepare(nodes: KnowledgeNode[]): { visible: KnowledgeNode[]; childCount: Map<string, number> } {
  const childCount = new Map<string, number>()
  for (const n of nodes) {
    const e = n.entry
    if (e && e.kind === 'workspace' && e.parent_id) {
      childCount.set(e.parent_id, (childCount.get(e.parent_id) ?? 0) + 1)
    }
  }
  const visible = nodes.filter((n) => !(n.entry?.kind === 'workspace' && n.entry.parent_id))
  return { visible, childCount }
}

export function NodeView(props: Props) {
  const { nodes, display } = props

  if (nodes.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white px-6 py-16 text-center">
        <p className="text-sm font-medium text-gray-700">Nothing here yet</p>
        <p className="mt-1 text-xs text-gray-500">Try a different type or entity, or add something with “+ New entry”.</p>
      </div>
    )
  }

  // Tree uses the FULL node set (child pages must show nested, not be hidden
  // the way cards/list collapse them into a per-parent count pill).
  if (display === 'tree') return <TreeView {...props} />

  const { visible, childCount } = prepare(nodes)
  return display === 'cards'
    ? <CardsGrid {...props} visible={visible} childCount={childCount} />
    : <ListTable {...props} visible={visible} childCount={childCount} />
}

// ── Tree ─────────────────────────────────────────────────────────────────────
// Containment view (spec OQ-5): pages nest under their parent page; every other
// type sits at the root. Built from the pure tree model so the edge logic is
// unit-tested. Each row reuses the same navigation as cards/list.

function TreeView(props: Props) {
  const tree = buildTree(props.nodes, { extraLinks: props.treeLinks })
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <ul className="divide-y divide-gray-100">
        {tree.map((t) => (
          <TreeRow key={t.node.id} item={t} {...props} />
        ))}
      </ul>
    </div>
  )
}

function TreeRow({ item, ...props }: { item: TreeNode } & Props) {
  const { onOpenDatabase, onOpenVault } = props
  const [open, setOpen] = useState(true)
  const { node, children, depth } = item
  const m = TYPE_META[node.type]
  const hasChildren = children.length > 0
  // 14px per level + room for the chevron column.
  const pad = 12 + depth * 16

  const label = (
    <span className="inline-flex items-center gap-2">
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${m.dot}`} />
      <span className="font-medium text-gray-900 line-clamp-1 group-hover:text-indigo-700">{node.title}</span>
      <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${m.badge}`}>{m.label}</span>
      {hasChildren && (
        <span className="shrink-0 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">{children.length}</span>
      )}
    </span>
  )

  return (
    <li>
      <div className="group flex items-center gap-2 px-3 py-2 hover:bg-gray-50" style={{ paddingLeft: pad }}>
        {hasChildren ? (
          <button onClick={() => setOpen((v) => !v)} aria-label={open ? 'Collapse' : 'Expand'}
            className="w-4 shrink-0 text-gray-400 hover:text-gray-700">{open ? '▾' : '▸'}</button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <div className="min-w-0 flex-1 text-sm">
          {node.type === 'database' ? (
            <button onClick={() => onOpenDatabase?.(node.id)} className="block w-full text-left">{label}</button>
          ) : node.type === 'vault' ? (
            <button onClick={() => onOpenVault?.(node)} className="block w-full text-left">{label}</button>
          ) : (
            <Link href={`/dashboard/knowledge/${node.id}`} className="block">{label}</Link>
          )}
        </div>
        <EntityChips entities={node.entities} variant="plain" />
        <span className="shrink-0 text-[11px] text-gray-400">{new Date(node.updatedAt).toLocaleDateString()}</span>
      </div>
      {hasChildren && open && (
        <ul>
          {children.map((c) => (
            <TreeRow key={c.node.id} item={c} {...props} />
          ))}
        </ul>
      )}
    </li>
  )
}

// ── Cards ────────────────────────────────────────────────────────────────────

function CardsGrid({
  visible, childCount, pendingForwards = {}, selectable = false, selectedIds,
  onToggleSelect, onChat, onDelete, onOpenDatabase, onOpenVault, onFile, onReview, areaNames = {},
}: Props & { visible: KnowledgeNode[]; childCount: Map<string, number> }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {visible.map((n) => {
        if (n.type === 'database') return <DbCard key={n.id} node={n} onOpen={onOpenDatabase} />
        if (n.type === 'vault') return <VaultCard key={n.id} node={n} onOpen={onOpenVault} />
        return (
          <EntryCard
            key={n.id}
            node={n}
            childCount={childCount.get(n.id) ?? 0}
            pending={pendingForwards[n.id] ?? 0}
            selectable={selectable}
            selected={selectedIds?.has(n.id) ?? false}
            onToggleSelect={onToggleSelect}
            onChat={onChat}
            onDelete={onDelete}
            onFile={onFile}
            onReview={onReview}
            areaNames={areaNames}
          />
        )
      })}
    </div>
  )
}

function TypeBadge({ type }: { type: KnowledgeNode['type'] }) {
  const m = TYPE_META[type]
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${m.badge}`}>
      {m.label}
    </span>
  )
}

function EntryCard({
  node, childCount, pending, selectable, selected, onToggleSelect, onChat, onDelete, onFile, onReview, areaNames = {},
}: {
  node: KnowledgeNode; childCount: number; pending: number
  selectable: boolean; selected: boolean
  onToggleSelect?: (id: string) => void
  onChat?: (entry: KnowledgeEntry) => void
  onDelete?: (id: string) => void
  onFile?: (id: string, entities: string[]) => Promise<void>
  onReview?: (id: string) => Promise<void>
  areaNames?: Record<string, string>
}) {
  const e = node.entry!
  const areaLabels = (e.areas ?? []).map(id => areaNames[id]).filter(Boolean) as string[]
  const isInbox = e.triage_status === 'inbox' && !!onFile
  // Surface staleness at a glance on every entry card; the inline review bar only
  // shows in the dedicated 🕓 Review queue (where onReview is wired).
  const stale = !isInbox && staleStatus(e).stale
  const showReview = stale && !!onReview
  return (
    <article className={`group flex flex-col rounded-xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
      isInbox ? 'border-indigo-200 ring-1 ring-indigo-100'
      : selected ? 'border-indigo-500 ring-2 ring-indigo-200'
      : stale ? 'border-amber-200 ring-1 ring-amber-100'
      : 'border-gray-200'
    }`}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {selectable && (
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect?.(node.id)}
            aria-label={`Select ${node.title} for merge`}
            className="h-4 w-4 cursor-pointer accent-indigo-600"
          />
        )}
        <TypeBadge type={node.type} />
        <EntityChips entities={node.entities} />
        {e.idea_status && e.idea_status !== 'raw' && (
          <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">{e.idea_status}</span>
        )}
        {stale && (
          <span title="Past its review cadence" className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">🕓 stale</span>
        )}
        {node.type === 'page' && childCount > 0 ? (
          <span title={`${childCount} child page${childCount === 1 ? '' : 's'}`}
            className="ml-auto inline-flex items-center gap-0.5 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700">
            📄 {childCount}
          </span>
        ) : null}
        {pending ? (
          <span title={`${pending} forward request${pending === 1 ? '' : 's'} awaiting approval`}
            className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">
            ⚠ {pending} pending
          </span>
        ) : null}
      </div>
      <Link href={`/dashboard/knowledge/${node.id}`} className="mb-1">
        <h3 className="line-clamp-2 text-sm font-semibold text-gray-900 hover:text-indigo-700">{node.title}</h3>
      </Link>
      {e.summary && <p className="mb-2 line-clamp-2 text-xs text-gray-500">{e.summary}</p>}
      {e.body && !e.summary && <p className="mb-2 line-clamp-3 text-xs text-gray-600">{e.body}</p>}
      {e.tags.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {e.tags.slice(0, 4).map((t) => (
            <span key={t} className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-600">#{t}</span>
          ))}
        </div>
      )}
      {areaLabels.length > 0 && <AreaChips names={areaLabels} className="mb-2" />}
      {isInbox && onFile && <TriageBar node={node} onFile={onFile} />}
      {showReview && onReview && <ReviewBar node={node} onReview={onReview} />}
      <div className="mt-auto flex items-center justify-between border-t border-gray-100 pt-2 text-[11px] text-gray-400">
        <span>{new Date(node.updatedAt).toLocaleDateString()}</span>
        <div className="flex items-center gap-3 opacity-0 transition-opacity group-hover:opacity-100">
          {onChat && e.kind !== 'chat' && (
            <button onClick={() => onChat(e)} className="font-medium text-indigo-600 hover:text-indigo-500">Chat</button>
          )}
          {onDelete && (
            <button onClick={() => { if (confirm('Delete this entry?')) onDelete(node.id) }} className="hover:text-red-600">Delete</button>
          )}
        </div>
      </div>
    </article>
  )
}

/** Inline triage controls on an inbox card (Sprint 13 T2). Pre-selects the AI's
 *  entity guess (D6); File is disabled until ≥1 entity is chosen (D5). */
function TriageBar({ node, onFile }: { node: KnowledgeNode; onFile: (id: string, entities: string[]) => Promise<void> }) {
  const suggested = node.entry?.suggested_entity
  const [selected, setSelected] = useState<string[]>(suggested ? [suggested] : [])
  const [busy, startFile] = useTransition()
  const file = () => {
    if (selected.length === 0) return
    startFile(async () => { await onFile(node.id, selected) })
  }
  return (
    <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/60 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-indigo-700">📥 File to…</span>
        {suggested && <span className="text-[10px] text-indigo-500">suggested: {suggested}</span>}
      </div>
      <EntityMultiSelect options={ENTITY_SELECT_OPTIONS} selected={selected} onChange={setSelected} />
      <div className="mt-2 flex justify-end">
        <button onClick={file} disabled={busy || selected.length === 0}
          className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
          {busy ? 'Filing…' : 'File'}
        </button>
      </div>
    </div>
  )
}

/** Inline review control on a stale card (Sprint 13 staleness). Shows how
 *  overdue the entry is and lets the human re-vouch for it in one click. */
function ReviewBar({ node, onReview }: { node: KnowledgeNode; onReview: (id: string) => Promise<void> }) {
  const e = node.entry!
  const status = staleStatus(e)
  const overdue = status.dueInDays !== null ? Math.abs(status.dueInDays) : 0
  const [busy, startReview] = useTransition()
  const review = () => startReview(async () => { await onReview(node.id) })
  return (
    <div className="mt-2 rounded-lg border border-amber-100 bg-amber-50/60 p-2.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-wide text-amber-800">🕓 Needs review</span>
        <span className="text-[10px] text-amber-600">
          {e.last_reviewed_at ? `reviewed ${new Date(e.last_reviewed_at).toLocaleDateString()}` : 'never reviewed'} · {overdue}d overdue
        </span>
      </div>
      <div className="flex justify-end">
        <button onClick={review} disabled={busy}
          className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-500 disabled:opacity-40">
          {busy ? 'Marking…' : '✓ Mark reviewed'}
        </button>
      </div>
    </div>
  )
}

function DbCard({ node, onOpen }: { node: KnowledgeNode; onOpen?: (id: string) => void }) {
  const count = node.database?.record_count ?? 0
  return (
    <button onClick={() => onOpen?.(node.id)}
      className="group flex flex-col rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <TypeBadge type="database" />
        <EntityChips entities={node.entities} />
        <span className="ml-auto text-xs tabular-nums text-gray-400">{count} {count === 1 ? 'row' : 'rows'}</span>
      </div>
      <h3 className="mb-1 inline-flex items-center gap-1.5 text-sm font-semibold text-gray-900 group-hover:text-indigo-700">
        {node.database?.icon && <span>{node.database.icon}</span>}
        {node.title}
      </h3>
      {node.database?.description && <p className="mb-2 line-clamp-2 text-xs text-gray-500">{node.database.description}</p>}
      <div className="mt-auto border-t border-gray-100 pt-2 text-[11px] text-gray-400">
        {new Date(node.updatedAt).toLocaleDateString()} · open table →
      </div>
    </button>
  )
}

function VaultCard({ node, onOpen }: { node: KnowledgeNode; onOpen?: (node: KnowledgeNode) => void }) {
  return (
    <button onClick={() => onOpen?.(node)}
      className="group flex flex-col rounded-xl border border-amber-200 bg-amber-50/40 p-4 text-left shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <TypeBadge type="vault" />
        <EntityChips entities={node.entities} />
      </div>
      <h3 className="mb-1 line-clamp-2 text-sm font-semibold text-gray-900 group-hover:text-amber-800">🔒 {node.title}</h3>
      {node.vault?.summary && <p className="mb-2 line-clamp-2 text-xs text-gray-500">{node.vault.summary}</p>}
      <div className="mt-auto border-t border-amber-100 pt-2 text-[11px] text-gray-500">
        {new Date(node.updatedAt).toLocaleDateString()} · download →
      </div>
    </button>
  )
}

// ── List ─────────────────────────────────────────────────────────────────────

function ListTable({
  visible, childCount, pendingForwards = {}, selectable = false, selectedIds,
  onToggleSelect, onDelete, onOpenDatabase, onOpenVault,
}: Props & { visible: KnowledgeNode[]; childCount: Map<string, number> }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <table className="w-full text-sm">
        <thead className="border-b border-gray-200 bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            {selectable && <th className="w-8 px-3 py-2" />}
            <th className="px-4 py-2 text-left font-semibold">Title</th>
            <th className="px-3 py-2 text-left font-semibold">Type</th>
            <th className="px-3 py-2 text-left font-semibold">Entity</th>
            <th className="px-3 py-2 text-left font-semibold">Updated</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {visible.map((n) => {
            const m = TYPE_META[n.type]
            const isEntry = !!n.entry
            const selected = selectedIds?.has(n.id) ?? false
            return (
              <tr key={n.id} className={`group hover:bg-gray-50 ${selected ? 'bg-indigo-50' : ''}`}>
                {selectable && (
                  <td className="px-3 py-2.5 text-center">
                    {isEntry && (
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => onToggleSelect?.(n.id)}
                        aria-label={`Select ${n.title} for merge`}
                        className="h-4 w-4 cursor-pointer accent-indigo-600"
                      />
                    )}
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <TitleCell node={n} childCount={childCount.get(n.id) ?? 0} pending={pendingForwards[n.id] ?? 0}
                    onOpenDatabase={onOpenDatabase} onOpenVault={onOpenVault} />
                </td>
                <td className="px-3 py-2.5">
                  <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wide text-gray-600">
                    <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />{m.label}
                  </span>
                </td>
                <td className="px-3 py-2.5"><EntityChips entities={n.entities} variant="plain" /></td>
                <td className="px-3 py-2.5 text-xs text-gray-500">{new Date(n.updatedAt).toLocaleDateString()}</td>
                <td className="px-3 py-2.5 text-right">
                  {isEntry && onDelete && (
                    <button onClick={() => { if (confirm('Delete this entry?')) onDelete(n.id) }}
                      className="text-xs text-gray-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100">
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function TitleCell({
  node, childCount, pending, onOpenDatabase, onOpenVault,
}: {
  node: KnowledgeNode; childCount: number; pending: number
  onOpenDatabase?: (id: string) => void
  onOpenVault?: (node: KnowledgeNode) => void
}) {
  const inner = (
    <div className="flex items-center gap-2">
      <span className="font-medium text-gray-900 line-clamp-1 group-hover:text-indigo-700">{node.title}</span>
      {node.type === 'page' && childCount > 0 ? (
        <span className="ml-1 rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">📄 {childCount}</span>
      ) : null}
      {pending ? (
        <span title={`${pending} forward request${pending === 1 ? '' : 's'} awaiting approval`}
          className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">⚠ {pending}</span>
      ) : null}
    </div>
  )
  if (node.type === 'database') {
    return <button onClick={() => onOpenDatabase?.(node.id)} className="block w-full text-left">{inner}</button>
  }
  if (node.type === 'vault') {
    return <button onClick={() => onOpenVault?.(node)} className="block w-full text-left">{inner}</button>
  }
  return (
    <Link href={`/dashboard/knowledge/${node.id}`} className="block">
      {inner}
      {node.entry?.summary && <p className="mt-0.5 line-clamp-1 text-xs text-gray-500 pl-0">{node.entry.summary}</p>}
    </Link>
  )
}

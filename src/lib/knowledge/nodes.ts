// Unified Knowledge Browser — the node model (Phase U1).
//
// One browser over three stores: knowledge_entries (pages/docs/ideas/notes/
// chats), hq_databases, and vault entries. Each becomes a first-class
// `KnowledgeNode`. This module is PURE (no I/O) so it's shared by the server
// reader (api/knowledge/nodes.ts) and the hub's initial render, and unit-tested.
//
// Spec: docs/specs/hq_knowledge-unified-browser_v1.html (LOCKED 2026-06-22).

import type { KnowledgeEntry } from '@/app/api/knowledge/actions'
import type { VaultEntry } from '@/app/api/knowledge/vault'
import type { HqDatabase } from '@/lib/databases/types'

export type KnowledgeNodeType = 'page' | 'doc' | 'idea' | 'note' | 'chat' | 'database' | 'vault'
// 'inbox' and 'stale' are NOT node types — the underlying item is still a
// page/doc/idea/note. They're cross-kind scopes (triage_status='inbox' /
// computed staleness) the server reader loads separately. Modelled as TypeFilter
// peers of 'all' so they sit in the Type row.
export type TypeFilter = 'all' | 'inbox' | 'stale' | KnowledgeNodeType

export interface KnowledgeNode {
  id: string
  type: KnowledgeNodeType
  title: string
  entities: string[]
  updatedAt: string
  // Exactly one source payload is set, by type.
  entry?: KnowledgeEntry
  database?: HqDatabase
  vault?: VaultEntry
}

export const TYPE_META: Record<KnowledgeNodeType, { label: string; icon: string; badge: string; dot: string }> = {
  page: { label: 'Page', icon: '📄', badge: 'bg-teal-100 text-teal-800', dot: 'bg-teal-500' },
  doc: { label: 'Doc', icon: '📃', badge: 'bg-blue-100 text-blue-800', dot: 'bg-blue-500' },
  idea: { label: 'Idea', icon: '💡', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  note: { label: 'Note', icon: '📝', badge: 'bg-gray-100 text-gray-700', dot: 'bg-gray-400' },
  chat: { label: 'Chat', icon: '💬', badge: 'bg-purple-100 text-purple-800', dot: 'bg-purple-500' },
  database: { label: 'Database', icon: '▤', badge: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500' },
  vault: { label: 'Vault', icon: '🔒', badge: 'bg-red-100 text-red-800', dot: 'bg-red-500' },
}

// Toolbar Type filter — Pages / Databases / Vault are now *types*, not separate
// view tabs (the spec's core fix). Order groups the prose types, then structured,
// then the rest.
export const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'page', label: 'Pages' },
  { value: 'doc', label: 'Docs' },
  { value: 'database', label: 'Databases' },
  { value: 'idea', label: 'Ideas' },
  { value: 'note', label: 'Notes' },
  { value: 'chat', label: 'Chats' },
  { value: 'vault', label: 'Vault' },
  // The triage queue — un-filed quick captures (Sprint 13). Peer of Vault: a
  // scope over a column (triage_status), not a kind.
  { value: 'inbox', label: '📥 Inbox' },
  // The "needs review" queue — filed entries past their review cadence (Sprint 13
  // staleness). A computed scope, like inbox: the server reader loads it separately.
  { value: 'stale', label: '🕓 Review' },
]

/** Map a knowledge_entries.kind to a node type. Returns null for kinds that
 *  don't surface as their own node (critique, or anything unknown). */
export function entryKindToNodeType(kind: string): KnowledgeNodeType | null {
  switch (kind) {
    case 'workspace': return 'page'
    case 'doc': return 'doc'
    case 'idea': return 'idea'
    case 'note': return 'note'
    case 'chat': return 'chat'
    default: return null
  }
}

/** Union the three stores into one node list, newest-touched first. PURE. */
export function buildNodes(src: {
  entries: KnowledgeEntry[]
  databases: HqDatabase[]
  vault: VaultEntry[]
}): KnowledgeNode[] {
  const nodes: KnowledgeNode[] = []

  for (const e of src.entries) {
    const type = entryKindToNodeType(e.kind)
    if (!type) continue
    nodes.push({
      id: e.id, type, title: e.title ?? '(untitled)',
      entities: e.entities ?? [], updatedAt: e.updated_at, entry: e,
    })
  }
  for (const d of src.databases) {
    nodes.push({
      id: d.id, type: 'database', title: d.title,
      entities: d.entities ?? [], updatedAt: d.updated_at, database: d,
    })
  }
  for (const v of src.vault) {
    nodes.push({
      id: v.id, type: 'vault', title: v.title ?? '(untitled)',
      entities: v.entities ?? [], updatedAt: v.created_at, vault: v,
    })
  }

  return nodes.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function filterNodesByType(nodes: KnowledgeNode[], type: TypeFilter): KnowledgeNode[] {
  // 'all', 'inbox', and 'stale' don't narrow by node type: 'all' shows everything,
  // and the inbox / stale sets are already scoped server-side, so the hub passes
  // the pre-scoped list straight through.
  if (type === 'all' || type === 'inbox' || type === 'stale') return nodes
  return nodes.filter((n) => n.type === type)
}

/** Per-type counts for the toolbar filter badges. */
export function countNodesByType(nodes: KnowledgeNode[]): Record<KnowledgeNodeType, number> {
  const out = { page: 0, doc: 0, idea: 0, note: 0, chat: 0, database: 0, vault: 0 }
  for (const n of nodes) out[n.type] += 1
  return out
}

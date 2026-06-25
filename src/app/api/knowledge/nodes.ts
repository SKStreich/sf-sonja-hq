'use server'
/**
 * Unified Knowledge Browser — the one server reader (Phase U1).
 *
 * OQ-2 (locked): app-code union per request — no materialized index. Calls the
 * three existing readers and normalizes into KnowledgeNode[]. Entity + query
 * are applied uniformly: `listEntries` already filters entries server-side; the
 * same filters are mirrored onto databases + vault here so every type obeys them.
 *
 * Triage (Sprint 13): `triage` scopes the entry set. Default 'filed' so the main
 * feed excludes un-filed quick captures (spec D4). The 📥 Inbox filter passes
 * 'inbox', which is entries-only — databases and vault have no triage concept and
 * are never un-filed, so they're skipped entirely for the inbox scope.
 */
import { createClient } from '@/lib/supabase/server'
import { listEntries, listStaleEntries, type Entity } from './actions'
import { listDatabases } from './databases'
import { listVaultEntries } from './vault'
import { buildNodes, type KnowledgeNode } from '@/lib/knowledge/nodes'

export async function listNodes(opts: {
  entity?: Entity | null
  query?: string | null
  triage?: 'filed' | 'inbox'
  /** Stale scope (Sprint 13): the "needs review" queue — entries-only, like inbox. */
  stale?: boolean
} = {}): Promise<KnowledgeNode[]> {
  const entity = opts.entity ?? null
  const query = (opts.query ?? '').trim().toLowerCase()
  const triage = opts.triage ?? 'filed'

  // Stale is entries-only (databases/vault have no review cadence) — skip them.
  if (opts.stale) {
    const entries = await listStaleEntries({ entity, query: opts.query })
    return buildNodes({ entries, databases: [], vault: [] })
  }

  // Inbox is entries-only — skip the database + vault reads entirely.
  if (triage === 'inbox') {
    const entries = await listEntries({ entity, query: opts.query, triage: 'inbox', limit: 500 })
    return buildNodes({ entries, databases: [], vault: [] })
  }

  const [entries, databases, vault] = await Promise.all([
    listEntries({ entity, query: opts.query, triage: 'filed', limit: 500 }),
    listDatabases(),
    // Vault is owner-only; a non-owner read returns [] rather than throwing.
    listVaultEntries().catch(() => []),
  ])

  const matchEntity = (entities: string[]) => !entity || entities.includes(entity)
  const matchQuery = (title: string) => !query || title.toLowerCase().includes(query)

  return buildNodes({
    entries, // already entity/query/triage-filtered by listEntries
    databases: databases.filter((d) => matchEntity(d.entities ?? []) && matchQuery(d.title)),
    vault: vault.filter((v) => matchEntity(v.entities ?? []) && matchQuery(v.title ?? '')),
  })
}

/**
 * Count of un-filed entries in the caller's org — the 📥 Inbox badge / dashboard
 * chip number (the "shrinking queue"). A head count over the partial index; no
 * rows fetched. RLS scopes it to the org via the standard knowledge_entries
 * policies.
 */
export async function countInbox(): Promise<number> {
  const supabase = createClient()
  const { count, error } = await (supabase as any)
    .from('knowledge_entries')
    .select('id', { count: 'exact', head: true })
    .eq('access', 'standard')
    .eq('status', 'active')
    .eq('triage_status', 'inbox')
  if (error) return 0
  return count ?? 0
}

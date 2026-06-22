'use server'
/**
 * Unified Knowledge Browser — the one server reader (Phase U1).
 *
 * OQ-2 (locked): app-code union per request — no materialized index. Calls the
 * three existing readers and normalizes into KnowledgeNode[]. Entity + query
 * are applied uniformly: `listEntries` already filters entries server-side; the
 * same filters are mirrored onto databases + vault here so every type obeys them.
 */
import { listEntries, type Entity } from './actions'
import { listDatabases } from './databases'
import { listVaultEntries } from './vault'
import { buildNodes, type KnowledgeNode } from '@/lib/knowledge/nodes'

export async function listNodes(opts: {
  entity?: Entity | null
  query?: string | null
} = {}): Promise<KnowledgeNode[]> {
  const entity = opts.entity ?? null
  const query = (opts.query ?? '').trim().toLowerCase()

  const [entries, databases, vault] = await Promise.all([
    listEntries({ entity, query: opts.query, limit: 500 }),
    listDatabases(),
    // Vault is owner-only; a non-owner read returns [] rather than throwing.
    listVaultEntries().catch(() => []),
  ])

  const matchEntity = (entities: string[]) => !entity || entities.includes(entity)
  const matchQuery = (title: string) => !query || title.toLowerCase().includes(query)

  return buildNodes({
    entries, // already entity/query-filtered by listEntries
    databases: databases.filter((d) => matchEntity(d.entities ?? []) && matchQuery(d.title)),
    vault: vault.filter((v) => matchEntity(v.entities ?? []) && matchQuery(v.title ?? '')),
  })
}

'use server'
/**
 * Unified Knowledge Browser — containment + inline DB embeds (Phase U3c).
 *
 * Two related substrates (migration 20260622000001):
 *   • knowledge_db_embeds — a database rendered INLINE on a page (the visible
 *     "embed this DB here" feature).
 *   • knowledge_node_links — the generic containment graph the Tree reads. An
 *     embed also writes a node-link (parent=page, child=database) so the
 *     embedded DB nests under its host page in the Tree display.
 *
 * Embedding does both; un-embedding removes both. All writes go through the
 * caller's RLS-scoped client (both tables are org-scoped under get_my_org_id()).
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getDatabaseDetail } from './databases'
import type { DatabaseDetail } from '@/lib/databases/types'
import type { NodeEdge } from '@/lib/knowledge/tree'

async function getCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

/** Embed database `databaseId` inline on page `hostEntryId`. Both must be in
 *  the caller's org. Idempotent: a duplicate embed (unique host+db) is a no-op.
 *  Also records the containment edge so the Tree nests the DB under the page. */
export async function embedDatabase(hostEntryId: string, databaseId: string): Promise<void> {
  const { supabase, org_id } = await getCtx()

  const { data: host } = await (supabase as any)
    .from('knowledge_entries').select('id, org_id').eq('id', hostEntryId).maybeSingle()
  if (!host) throw new Error('Page not found')
  if (host.org_id !== org_id) throw new Error('Page in different org')

  const { data: db } = await (supabase as any)
    .from('hq_databases').select('id, org_id').eq('id', databaseId).maybeSingle()
  if (!db) throw new Error('Database not found')
  if (db.org_id !== org_id) throw new Error('Database in different org')

  const { error: embedErr } = await (supabase as any).from('knowledge_db_embeds').insert({
    org_id, host_entry_id: hostEntryId, database_id: databaseId, view_config: {},
  })
  if (embedErr && embedErr.code !== '23505') {
    throw new Error('Failed to embed database: ' + embedErr.message)
  }

  // Containment edge for the Tree. Independent unique constraint → swallow dup.
  const { error: linkErr } = await (supabase as any).from('knowledge_node_links').insert({
    org_id, parent_id: hostEntryId, child_id: databaseId, child_source: 'database',
  })
  if (linkErr && linkErr.code !== '23505') {
    throw new Error('Failed to record containment: ' + linkErr.message)
  }

  revalidatePath(`/dashboard/knowledge/${hostEntryId}`)
}

/** Remove an inline DB embed (and its containment edge) from a page. */
export async function removeDatabaseEmbed(hostEntryId: string, databaseId: string): Promise<void> {
  const { supabase } = await getCtx()
  const { error } = await (supabase as any)
    .from('knowledge_db_embeds').delete().eq('host_entry_id', hostEntryId).eq('database_id', databaseId)
  if (error) throw new Error('Failed to remove embed: ' + error.message)
  await (supabase as any)
    .from('knowledge_node_links')
    .delete()
    .eq('parent_id', hostEntryId).eq('child_id', databaseId).eq('child_source', 'database')
  revalidatePath(`/dashboard/knowledge/${hostEntryId}`)
}

/** The databases embedded on a page, in embed order, each with full detail
 *  (schema + records) so the page can render them inline read-only. */
export async function getPageEmbeds(hostEntryId: string): Promise<DatabaseDetail[]> {
  const { supabase } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_db_embeds')
    .select('database_id, position')
    .eq('host_entry_id', hostEntryId)
    .order('position')
  if (error) throw new Error('Failed to load embeds: ' + error.message)
  const ids = ((data ?? []) as { database_id: string }[]).map((r) => r.database_id)
  const details = await Promise.all(ids.map((id) => getDatabaseDetail(id)))
  return details.filter((d): d is DatabaseDetail => d !== null)
}

/** All containment edges in the caller's org, as tree NodeEdges. Feeds the Tree
 *  display so embedded databases nest under their host page. RLS-scoped. */
export async function listNodeLinks(): Promise<NodeEdge[]> {
  const supabase = createClient()
  const { data, error } = await (supabase as any)
    .from('knowledge_node_links')
    .select('parent_id, child_id')
  if (error) throw error
  return ((data ?? []) as { parent_id: string; child_id: string }[]).map((r) => ({
    parentId: r.parent_id,
    childId: r.child_id,
  }))
}

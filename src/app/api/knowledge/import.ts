'use server'
/**
 * Bulk import into the triage inbox (Sprint 13 T3).
 *
 * The first bulk importer: a self-contained paste/file path (no external API).
 * Each item lands as an inbox knowledge_entry (born 'inbox', no entity — D2) with
 * external lineage so re-runs are NON-DESTRUCTIVE: an item whose (source, ref) is
 * already present is skipped, never re-inserted and never bounced back to the
 * inbox if the human already filed it.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { insertInboxEntry, type InboxKind } from '@/lib/knowledge/inbox-create'
import type { BulkItem } from '@/lib/knowledge/bulk-import'

const MAX_ITEMS = 500

export interface ImportResult { created: number; skipped: number }

export async function importInboxBatch(input: {
  items: BulkItem[]
  source?: string
  kind?: InboxKind
}): Promise<ImportResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  const org_id = profile.org_id as string

  const source = input.source?.trim() || 'bulk_paste'
  const kind: InboxKind = input.kind ?? 'note'
  const items = (input.items ?? []).filter(i => i.body?.trim()).slice(0, MAX_ITEMS)
  if (items.length === 0) return { created: 0, skipped: 0 }

  // Non-destructive: find which refs already exist for this org+source in one read.
  const refs = items.map(i => i.ref)
  const { data: existingRows } = await (supabase as any)
    .from('knowledge_entries')
    .select('external_ref')
    .eq('org_id', org_id)
    .eq('external_source', source)
    .in('external_ref', refs)
  const existing = new Set((existingRows ?? []).map((r: { external_ref: string }) => r.external_ref))

  let created = 0
  let skipped = 0
  for (const item of items) {
    if (existing.has(item.ref)) { skipped++; continue } // already imported — leave it
    await insertInboxEntry(supabase, user.id, org_id, {
      body: item.body,
      kind,
      title: item.title,
      source,
      externalSource: source,
      externalRef: item.ref,
    })
    created++
  }

  if (created > 0) {
    revalidatePath('/dashboard/knowledge')
    revalidatePath('/dashboard')
  }
  return { created, skipped }
}

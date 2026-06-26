'use server'
/**
 * Granola → triage-inbox importer (Sprint 13).
 *
 * Pulls recent Granola meeting notes into the 📥 inbox, mirroring the bulk
 * importer (api/knowledge/import.ts): each note becomes an inbox knowledge_entry
 * (born 'inbox', no entity — D2) carrying external lineage, so re-runs are
 * NON-DESTRUCTIVE — a note whose id is already imported is skipped, never
 * re-inserted and never bounced back to the inbox once the human has filed it.
 *
 * Each entry = the note's title + its AI summary (Sonja's choice). The summary is
 * pulled from the note-detail endpoint; if a note has no summary yet, it's still
 * imported with the title as the body so it isn't silently dropped.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { insertInboxEntry } from '@/lib/knowledge/inbox-create'
import {
  getGranolaApiKey, listGranolaNotes, getGranolaNote, extractGranolaSummary,
} from '@/lib/integrations/granola'

const SOURCE = 'granola'
const MAX_NOTES = 200   // cap one manual run; re-run to pull more (dedupe makes it safe)
const MAX_PAGES = 20

export interface GranolaImportResult { created: number; skipped: number; scanned: number }

export async function importGranolaNotes(): Promise<GranolaImportResult> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  const org_id = profile.org_id as string

  const key = getGranolaApiKey()
  if (!key) throw new Error('GRANOLA_API_KEY is not set in this environment.')

  // Paginate the note list (cursor) up to the per-run cap.
  const notes: { id: string; title: string | null; updated_at: string | null }[] = []
  let cursor: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await listGranolaNotes({ key, cursor })
    for (const n of res.notes) if (n.id) notes.push(n)
    if (notes.length >= MAX_NOTES || !res.hasMore || !res.cursor) break
    cursor = res.cursor
  }
  const batch = notes.slice(0, MAX_NOTES)
  if (batch.length === 0) return { created: 0, skipped: 0, scanned: 0 }

  // Non-destructive: one read of which note ids already exist for this org+source.
  const ids = batch.map(n => n.id)
  const { data: existingRows } = await (supabase as any)
    .from('knowledge_entries')
    .select('external_ref')
    .eq('org_id', org_id)
    .eq('external_source', SOURCE)
    .in('external_ref', ids)
  const existing = new Set((existingRows ?? []).map((r: { external_ref: string }) => r.external_ref))

  let created = 0
  let skipped = 0
  for (const note of batch) {
    if (existing.has(note.id)) { skipped++; continue } // already imported — leave it
    // Best-effort summary; a note without one still imports (title as body).
    let summary: string | null = null
    try { summary = extractGranolaSummary(await getGranolaNote(note.id, key)) } catch { /* keep null */ }
    const title = note.title?.trim() || 'Untitled Granola note'
    const body = summary || title
    await insertInboxEntry(supabase, user.id, org_id, {
      body,
      kind: 'note',
      title,
      summary: summary ?? undefined,
      source: SOURCE,
      externalSource: SOURCE,
      externalRef: note.id,
      externalLastEditedAt: note.updated_at ?? undefined,
    })
    created++
  }

  if (created > 0) {
    revalidatePath('/dashboard/knowledge')
    revalidatePath('/dashboard')
  }
  return { created, skipped, scanned: batch.length }
}

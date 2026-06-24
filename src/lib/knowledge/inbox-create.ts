/**
 * Inbox knowledge-entry creation (Sprint 13 T2).
 *
 * The shared write behind every low-friction capture path (Siri, capture API,
 * the HQ agent). It creates a knowledge_entries row born `triage_status='inbox'`
 * with NO entity (zero junction rows — the "no forced entity" half of D2); the
 * AI's entity guess rides along as `suggested_entity` for the triage UI to
 * pre-select (D6). The human gives it a home via fileEntry.
 *
 * Takes the supabase client explicitly so it works under both the RLS-scoped
 * client (capture API / agent — has a session) and the admin client (Siri — an
 * unauthenticated webhook keyed by capture_api_key). NOT a 'use server' module.
 */

export type InboxKind = 'idea' | 'note' | 'doc'

export interface InboxEntryInput {
  body: string
  kind?: InboxKind
  title?: string | null
  summary?: string | null
  typeHint?: string | null
  tags?: string[]
  suggestedEntity?: string | null
  /** Origin label stored in knowledge_entries.source (e.g. 'siri'). */
  source: string
  /** External lineage (T3) — set by bulk importers so re-runs can dedupe. */
  externalSource?: string | null
  externalRef?: string | null
  externalLastEditedAt?: string | null
}

export async function insertInboxEntry(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  orgId: string,
  input: InboxEntryInput,
): Promise<{ id: string }> {
  const body = input.body?.trim()
  if (!body) throw new Error('Body is required')
  const kind: InboxKind = input.kind ?? 'note'

  const { data, error } = await supabase
    .from('knowledge_entries')
    .insert({
      org_id: orgId,
      user_id: userId,
      kind,
      access: 'standard',
      title: input.title?.trim() || body.split('\n')[0].slice(0, 120),
      body,
      summary: input.summary ?? null,
      type_hint: input.typeHint ?? null,
      idea_status: kind === 'idea' ? 'raw' : null,
      tags: input.tags ?? [],
      source: input.source,
      triage_status: 'inbox',
      suggested_entity: input.suggestedEntity ?? null,
      external_source: input.externalSource ?? null,
      external_ref: input.externalRef ?? null,
      external_last_edited_at: input.externalLastEditedAt ?? null,
    })
    .select('id')
    .single()
  if (error) throw new Error('Failed to create inbox entry: ' + error.message)
  // No setEntryEntities — an inbox item has zero junction rows until filed.
  return { id: data.id as string }
}

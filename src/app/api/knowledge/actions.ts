'use server'
/**
 * Knowledge Hub — unified entries for ideas, docs, chats, notes.
 *
 * Vault (access='vault') is handled in ./vault.ts and is NEVER passed to Claude.
 * This file is the Tier-1 surface: standard-access entries + AI-assisted features.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getAnthropicApiKey } from '@/lib/anthropic-key'
import { fetchEntryEntityMap, fetchEntryIdsForEntity, setEntryEntities, sortEntitySlugs } from '@/lib/entities/multi-entity'
import { ENTITY_SLUGS } from '@/lib/entities/config'
import { htmlToMarkdown } from '@/lib/knowledge/html-to-markdown'
import { classifyEntry } from '@/lib/knowledge/classify'
import { isStale } from '@/lib/knowledge/staleness'

const KINDS = ['idea', 'doc', 'chat', 'note', 'critique', 'workspace'] as const
export type Kind = typeof KINDS[number]

const ENTITIES_CONST = ENTITY_SLUGS
export type Entity = typeof ENTITY_SLUGS[number]

const TYPE_HINTS_CONST = ['decision', 'strategy', 'primer', 'brand', 'marketing', 'business', 'idea'] as const
export type TypeHint = typeof TYPE_HINTS_CONST[number]

const IDEA_STATUSES_CONST = ['raw', 'developing', 'approved', 'shipped', 'parked'] as const
export type IdeaStatus = typeof IDEA_STATUSES_CONST[number]

export interface KnowledgeEntry {
  id: string
  kind: Kind | 'vault'
  access: 'standard' | 'vault'
  /** Multi-entity membership from the junction (≥1). */
  entities: Entity[]
  title: string | null
  body: string | null
  summary: string | null
  type_hint: TypeHint | null
  idea_status: IdeaStatus | null
  status: 'active' | 'archived'
  /** Triage lifecycle (Sprint 13), separate from `status`. Default 'filed';
   *  quick-capture paths land items in 'inbox' until they're given a home. */
  triage_status: 'inbox' | 'filed'
  /** AI's entity guess for an inbox item, pre-selected in the triage UI and
   *  cleared on file (D6). A suggestion only — membership lives in the junction. */
  suggested_entity: string | null
  /** Review cadence in days (Sprint 13 staleness). 0 = evergreen / never stale. */
  staleness_days: number
  /** When the human last vouched for this entry; null = never explicitly reviewed
   *  (the staleness formula then ages it from created_at). */
  last_reviewed_at: string | null
  tags: string[]
  source: string
  source_ref: string | null
  storage_path: string | null
  mime_type: string | null
  size_bytes: number | null
  confidence: number | null
  classification_overridden: boolean
  version: number
  created_at: string
  updated_at: string
  user_id: string
  parent_id: string | null
}

async function getCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

export async function listEntries(opts: {
  kind?: Kind | null
  entity?: Entity | null
  query?: string | null
  status?: 'active' | 'archived'
  /** Triage scope (Sprint 13). Omit = no triage filter (all rows);
   *  'filed'/'inbox' restrict to that triage_status. */
  triage?: 'filed' | 'inbox'
  limit?: number
} = {}): Promise<KnowledgeEntry[]> {
  const { supabase } = await getCtx()
  let q = (supabase as any)
    .from('knowledge_entries')
    .select('*')
    .eq('access', 'standard')
    .eq('status', opts.status ?? 'active')
    .order('updated_at', { ascending: false })
    .limit(opts.limit ?? 200)

  if (opts.triage) q = q.eq('triage_status', opts.triage)
  if (opts.kind) q = q.eq('kind', opts.kind)
  else q = q.neq('kind', 'critique')
  // Entity filter routes through the junction (OR-semantics): an entry matches
  // if it is tagged with the selected entity, regardless of its other entities.
  if (opts.entity) {
    const entryIds = await fetchEntryIdsForEntity(supabase, opts.entity)
    if (entryIds.length === 0) return []
    q = q.in('id', entryIds)
  }
  if (opts.query && opts.query.trim()) {
    const needle = `%${opts.query.trim()}%`
    q = q.or(`title.ilike.${needle},body.ilike.${needle}`)
  }
  const { data, error } = await q
  if (error) throw new Error('Failed to list entries: ' + error.message)
  const rows = (data ?? []) as KnowledgeEntry[]
  const entityMap = await fetchEntryEntityMap(supabase, rows.map(r => r.id))
  return rows.map(r => ({
    ...r,
    entities: (entityMap[r.id] ?? []) as Entity[],
  }))
}

export async function getEntry(id: string): Promise<KnowledgeEntry | null> {
  const { supabase } = await getCtx()
  const { data } = await (supabase as any)
    .from('knowledge_entries').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  const entityMap = await fetchEntryEntityMap(supabase, [id])
  return { ...data, entities: entityMap[id] ?? [] } as KnowledgeEntry
}

export async function createEntry(input: {
  body: string
  /** Legacy single-entity input (back-compat). Prefer `entities`. */
  entity?: Entity
  /** Multi-entity set. ≥1 required (combined with `entity`). */
  entities?: Entity[]
  kind?: Kind
  title?: string
  type_hint?: TypeHint
  tags?: string[]
}): Promise<{ id: string }> {
  const { supabase, user, org_id } = await getCtx()
  const body = input.body?.trim()
  if (!body) throw new Error('Body is required')

  // Combine single + set inputs, validate, and pick a primary for the legacy col.
  const requested = input.entities ?? (input.entity ? [input.entity] : [])
  if (requested.length === 0) throw new Error('At least one entity is required')
  if (!requested.every(e => (ENTITIES_CONST as readonly string[]).includes(e))) throw new Error('Invalid entity')
  const entitySet = sortEntitySlugs(requested) as Entity[]
  const primary = entitySet[0]

  const kind: Kind = input.kind ?? 'note'

  let classified = { title: '', type_hint: 'strategy' as TypeHint, tags: [] as string[], confidence: 0.5, summary: null as string | null }
  if (!input.title || !input.type_hint) {
    const c = await classifyEntry(body, { apiKey: getAnthropicApiKey(), entityHint: primary })
    classified = { ...c, type_hint: c.type_hint as TypeHint }
  }

  const title = input.title?.trim() || classified.title
  const type_hint = input.type_hint ?? classified.type_hint
  const tags = input.tags ?? classified.tags
  const confidence = classified.confidence
  const summary = classified.summary

  const idea_status: IdeaStatus | null = kind === 'idea' ? 'raw' : null

  const { data, error } = await (supabase as any)
    .from('knowledge_entries')
    .insert({
      org_id, user_id: user.id,
      kind, access: 'standard',
      title, body, summary,
      type_hint, idea_status,
      tags, confidence,
      source: 'manual',
    })
    .select('id')
    .single()
  if (error) throw new Error('Failed to create entry: ' + error.message)
  await setEntryEntities(supabase, data.id as string, org_id, entitySet)
  revalidatePath('/dashboard/knowledge')
  return { id: data.id as string }
}

/**
 * File an inbox item (Sprint 13 T2 — the triage action). Gives an un-filed entry
 * a home: writes its entity junction (≥1 required — D5) and flips
 * triage_status → 'filed', clearing the AI suggestion (D6). The human's chosen
 * entities ARE the correction signal for the standing "ingestion learns from
 * corrections" rule. Throws on 0 rows so an RLS-blocked file doesn't silently
 * no-op (mirrors deleteEntry).
 */
export async function fileEntry(id: string, entities: Entity[]): Promise<void> {
  const { supabase, org_id } = await getCtx()
  const entitySet = sortEntitySlugs(entities) as Entity[]
  if (entitySet.length === 0) throw new Error('At least one entity is required to file an entry')
  if (!entitySet.every(e => (ENTITIES_CONST as readonly string[]).includes(e))) throw new Error('Invalid entity')

  await setEntryEntities(supabase, id, org_id, entitySet)
  const { data, error } = await (supabase as any)
    .from('knowledge_entries')
    .update({ triage_status: 'filed', suggested_entity: null })
    .eq('id', id)
    .select('id')
  if (error) throw new Error('Failed to file entry: ' + error.message)
  if (!data || data.length === 0) {
    throw new Error('Nothing was filed — you may not have permission to file this entry.')
  }
  revalidatePath('/dashboard/knowledge')
  revalidatePath('/dashboard')
}

export async function updateEntry(id: string, patch: {
  title?: string | null
  body?: string | null
  kind?: Kind
  type_hint?: TypeHint | null
  idea_status?: IdeaStatus | null
  tags?: string[]
  /** Legacy single-entity input (back-compat). Prefer `entities`. */
  entity?: Entity
  /** Multi-entity set. When provided, reconciles the junction (≥1 required). */
  entities?: Entity[]
  status?: 'active' | 'archived'
  /** Review cadence (Sprint 13 staleness). Metadata — not a versioned content edit. */
  staleness_days?: number
}) {
  const { supabase, user, org_id } = await getCtx()
  const current = await getEntry(id)
  if (!current) throw new Error('Entry not found')

  // Resolve a desired entity set from either input. primary feeds the legacy col.
  let entitySet: Entity[] | undefined
  if (patch.entities !== undefined) entitySet = sortEntitySlugs(patch.entities) as Entity[]
  else if (patch.entity !== undefined) entitySet = [patch.entity]
  if (entitySet !== undefined && entitySet.length === 0) throw new Error('At least one entity is required')
  if (entitySet && !entitySet.every(e => (ENTITIES_CONST as readonly string[]).includes(e))) throw new Error('Invalid entity')
  const entitiesChanged =
    entitySet !== undefined && JSON.stringify(entitySet) !== JSON.stringify(sortEntitySlugs(current.entities))

  const changed = (field: keyof typeof patch, cur: any) =>
    patch[field] !== undefined && JSON.stringify(patch[field]) !== JSON.stringify(cur)

  const anyContentChanged =
    changed('title', current.title) ||
    changed('body', current.body) ||
    changed('kind', current.kind) ||
    entitiesChanged ||
    changed('tags', current.tags) ||
    changed('type_hint', current.type_hint) ||
    changed('idea_status', current.idea_status)

  if (anyContentChanged) {
    await (supabase as any).from('knowledge_versions').insert({
      entry_id: id,
      version: current.version,
      title: current.title,
      body: current.body,
      kind: current.kind,
      entity: current.entities[0], // version snapshot keeps a single primary entity
      tags: current.tags,
      summary: current.summary,
      type_hint: current.type_hint,
      idea_status: current.idea_status,
      created_by: user.id,
    })
  }

  const update: Record<string, any> = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.body !== undefined) update.body = patch.body
  if (anyContentChanged) update.version = current.version + 1
  if (patch.kind !== undefined) update.kind = patch.kind
  if (patch.type_hint !== undefined) {
    update.type_hint = patch.type_hint
    update.classification_overridden = true
  }
  if (patch.idea_status !== undefined) update.idea_status = patch.idea_status
  if (patch.tags !== undefined) update.tags = patch.tags
  if (patch.status !== undefined) update.status = patch.status
  // Cadence is metadata, not versioned content — set it without snapshotting.
  if (patch.staleness_days !== undefined) update.staleness_days = patch.staleness_days

  const { error } = await (supabase as any)
    .from('knowledge_entries').update(update).eq('id', id)
  if (error) throw new Error('Failed to update: ' + error.message)
  if (entitySet !== undefined) await setEntryEntities(supabase, id, org_id, entitySet)
  revalidatePath('/dashboard/knowledge')
  revalidatePath(`/dashboard/knowledge/${id}`)
}

/**
 * Mark an entry as reviewed (Sprint 13 staleness, concept #1). Resets
 * last_reviewed_at = now() so the staleness clock restarts — the human has
 * just vouched for the content. Not a versioned content edit; the existing
 * updated_at trigger floats the freshly-reviewed entry to the top of the feed.
 * Throws on 0 rows so an RLS-blocked review doesn't silently no-op.
 */
export async function markEntryReviewed(id: string): Promise<void> {
  const { supabase } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_entries')
    .update({ last_reviewed_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) throw new Error('Failed to mark reviewed: ' + error.message)
  if (!data || data.length === 0) {
    throw new Error('Nothing was marked reviewed — you may not have permission for this entry.')
  }
  revalidatePath('/dashboard/knowledge')
  revalidatePath(`/dashboard/knowledge/${id}`)
  revalidatePath('/dashboard')
}

/**
 * The "needs review" queue (Sprint 13 staleness). Filed, active, standard entries
 * whose review cadence has lapsed — inbox items are pre-triage (their own queue)
 * and never count as stale. Staleness is computed in-app via the single shared
 * formula (src/lib/knowledge/staleness.ts) so the badge / filter / count agree.
 */
export async function listStaleEntries(opts: { entity?: Entity | null; query?: string | null } = {}): Promise<KnowledgeEntry[]> {
  const entries = await listEntries({ entity: opts.entity, query: opts.query, triage: 'filed', limit: 500 })
  const now = Date.now()
  return entries.filter(e => isStale(e, now))
}

/** Count of stale entries — the dashboard "🕓 N to review" chip number. */
export async function countStale(): Promise<number> {
  return (await listStaleEntries()).length
}

/**
 * Convert-in-place (Phase U3c): promote a doc / note / idea into a workspace
 * PAGE. Keeps the same entry id, links, and version history — only `kind`
 * changes (snapshotted + reversible via updateEntry's version path). The
 * Original tab keeps holding any uploaded HTML; the page now also hosts a
 * Markdown body + can contain sub-pages / embedded databases.
 */
export async function convertEntryToPage(id: string): Promise<void> {
  const current = await getEntry(id)
  if (!current) throw new Error('Entry not found')
  if (current.kind === 'workspace') return // already a page
  if (current.kind === 'chat' || current.kind === 'critique') {
    throw new Error('Only docs, notes, and ideas can be converted to a page.')
  }
  // A page is edited as Markdown in the live split-pane. For an uploaded HTML
  // doc the real content lives in rendered_html (the flat `body` ingest extracts
  // is a single unstructured line — useless to edit). Derive a Markdown body
  // from the HTML so the page is genuinely editable. The HTML stays available
  // in the Original tab.
  const md = await pageBodyFromOriginal(id)
  await updateEntry(id, { kind: 'workspace', ...(md !== null ? { body: md } : {}) })
}

/**
 * Re-derive a workspace page's Markdown body from its Original HTML
 * (rendered_html). Lets a page converted from an HTML doc — or one whose body
 * is the flattened ingest text — be reflowed into editable Markdown on demand.
 */
export async function reflowPageFromOriginal(id: string): Promise<void> {
  const md = await pageBodyFromOriginal(id)
  if (md === null) throw new Error('This page has no Original HTML to reflow from.')
  await updateEntry(id, { body: md })
}

/** Returns Markdown derived from an entry's rendered_html, or null if it has
 *  none. Not exported ('use server' files only allow async-function exports). */
async function pageBodyFromOriginal(id: string): Promise<string | null> {
  const supabase = createClient()
  const { data } = await (supabase as any)
    .from('knowledge_entries').select('rendered_html').eq('id', id).maybeSingle()
  const html = data?.rendered_html as string | null | undefined
  if (!html || !html.trim()) return null
  const md = htmlToMarkdown(html)
  return md.trim() ? md : null
}

/**
 * Edit an entry's "Original" content in place (Phase U2 — editing parity).
 * For HTML entries this updates `rendered_html`; for text/markdown it updates
 * `body`. Snapshots the prior state into knowledge_versions (incl. rendered_html
 * / mime_type / storage_path) and bumps the version, so the edit is reversible.
 */
export async function updateEntryOriginal(
  id: string,
  content: { html?: string; text?: string },
): Promise<void> {
  if (content.html === undefined && content.text === undefined) return
  const { supabase, user } = await getCtx()

  const { data: cur, error: readErr } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, title, body, kind, tags, summary, type_hint, idea_status, version, rendered_html, mime_type, storage_path, knowledge_entry_entities(entity)')
    .eq('id', id)
    .maybeSingle()
  if (readErr || !cur) throw new Error('Entry not found')

  await (supabase as any).from('knowledge_versions').insert({
    entry_id: id,
    version: cur.version,
    title: cur.title,
    body: cur.body,
    kind: cur.kind,
    entity: cur.knowledge_entry_entities?.[0]?.entity ?? null,
    tags: cur.tags,
    summary: cur.summary,
    type_hint: cur.type_hint,
    idea_status: cur.idea_status,
    rendered_html: cur.rendered_html,
    mime_type: cur.mime_type,
    storage_path: cur.storage_path,
    created_by: user.id,
  })

  const update: Record<string, any> = { version: (cur.version ?? 1) + 1 }
  if (content.html !== undefined) update.rendered_html = content.html
  if (content.text !== undefined) update.body = content.text

  const { error } = await (supabase as any)
    .from('knowledge_entries').update(update).eq('id', id).select('id')
  if (error) throw new Error('Failed to save: ' + error.message)

  revalidatePath('/dashboard/knowledge')
  revalidatePath(`/dashboard/knowledge/${id}`)
}

export async function deleteEntry(id: string) {
  const { supabase } = await getCtx()
  // .select() returns the deleted rows; under RLS a delete that matches no rows
  // (e.g. another user's entry) succeeds with no error but deletes nothing.
  // Treat 0 deleted rows as a permission failure so it doesn't fail silently.
  const { data, error } = await (supabase as any)
    .from('knowledge_entries').delete().eq('id', id).select('id')
  if (error) throw new Error('Failed to delete: ' + error.message)
  if (!data || data.length === 0) {
    throw new Error('Nothing was deleted — you may not have permission to delete this entry.')
  }
  revalidatePath('/dashboard/knowledge')
}

export async function getHubMetrics(): Promise<{
  total: number
  byKind: Record<string, number>
  byEntity: Record<string, number>
  rawIdeas: number
  recentCount: number
}> {
  const { supabase } = await getCtx()
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString()
  const [allRes, rawRes, recentRes] = await Promise.all([
    (supabase as any).from('knowledge_entries').select('id, kind').eq('access', 'standard').eq('status', 'active'),
    (supabase as any).from('knowledge_entries').select('id', { count: 'exact', head: true }).eq('kind', 'idea').eq('idea_status', 'raw').eq('status', 'active'),
    (supabase as any).from('knowledge_entries').select('id', { count: 'exact', head: true }).eq('access', 'standard').gte('updated_at', sevenDaysAgo),
  ])
  const rows = (allRes.data ?? []) as { id: string; kind: string }[]
  const byKind: Record<string, number> = {}
  const byEntity: Record<string, number> = {}
  // Entity tally now comes from the junction — an entry counts once per entity it carries.
  const entityMap = await fetchEntryEntityMap(supabase, rows.map(r => r.id))
  rows.forEach(r => {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
    for (const ent of entityMap[r.id] ?? []) {
      byEntity[ent] = (byEntity[ent] ?? 0) + 1
    }
  })
  return {
    total: rows.length,
    byKind,
    byEntity,
    rawIdeas: rawRes.count ?? 0,
    recentCount: recentRes.count ?? 0,
  }
}

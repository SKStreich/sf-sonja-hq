'use server'
/**
 * Knowledge Hub — unified entries for ideas, docs, chats, notes.
 *
 * Vault (access='vault') is handled in ./vault.ts and is NEVER passed to Claude.
 * This file is the Tier-1 surface: standard-access entries + AI-assisted features.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicApiKey } from '@/lib/anthropic-key'
import { fetchEntryEntityMap, fetchEntryIdsForEntity, setEntryEntities, sortEntitySlugs } from '@/lib/entities/multi-entity'
import { ENTITY_SLUGS } from '@/lib/entities/config'

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
  /** Legacy single-entity column. Kept populated during the dual-write window. */
  entity: Entity
  /** Full multi-entity membership from the junction (≥1; defaults to [entity]). */
  entities: Entity[]
  title: string | null
  body: string | null
  summary: string | null
  type_hint: TypeHint | null
  idea_status: IdeaStatus | null
  status: 'active' | 'archived'
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
    entities: (entityMap[r.id] ?? [r.entity]) as Entity[],
  }))
}

export async function getEntry(id: string): Promise<KnowledgeEntry | null> {
  const { supabase } = await getCtx()
  const { data } = await (supabase as any)
    .from('knowledge_entries').select('*').eq('id', id).maybeSingle()
  if (!data) return null
  const entityMap = await fetchEntryEntityMap(supabase, [id])
  return { ...data, entities: entityMap[id] ?? [data.entity] } as KnowledgeEntry
}

async function classify(body: string, entityHint: Entity): Promise<{
  title: string; type_hint: TypeHint; tags: string[]; confidence: number; summary: string | null
}> {
  const fallback = {
    title: body.split('\n')[0].slice(0, 120),
    type_hint: 'strategy' as TypeHint,
    tags: [] as string[],
    confidence: 0.3,
    summary: null as string | null,
  }
  const apiKey = getAnthropicApiKey()
  if (!apiKey) return fallback

  let text = '{}'
  try {
    const client = new Anthropic({ apiKey })
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: `Classify this note into JSON with schema:
{
  "title": "short title (max 80 chars)",
  "type_hint": one of ["decision","strategy","primer","brand","marketing","business","idea"],
  "tags": ["lowercase","short","topical"],
  "confidence": 0.0 to 1.0,
  "summary": "one-sentence preview (max 160 chars)"
}

Entity context: ${entityHint}
Content:
${body.slice(0, 4000)}`,
      }],
    })
    text = res.content[0].type === 'text' ? res.content[0].text : '{}'
  } catch (err) {
    console.error('[classify] Anthropic call failed; saving with fallback metadata:', err)
    return fallback
  }

  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  try {
    const p = JSON.parse(jsonStr)
    const type_hint: TypeHint = (TYPE_HINTS_CONST as readonly string[]).includes(p.type_hint) ? p.type_hint : 'strategy'
    return {
      title: String(p.title ?? '').slice(0, 120) || fallback.title,
      type_hint,
      tags: Array.isArray(p.tags) ? p.tags.map((t: any) => String(t).toLowerCase()).slice(0, 8) : [],
      confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.5,
      summary: typeof p.summary === 'string' ? p.summary.slice(0, 200) : null,
    }
  } catch {
    return fallback
  }
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
    classified = await classify(body, primary)
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
      entity: primary, // legacy column = primary, kept during dual-write window
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
      entity: current.entity,
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
  // Legacy column tracks the primary entity during the dual-write window.
  if (entitySet !== undefined) update.entity = entitySet[0]
  if (patch.status !== undefined) update.status = patch.status

  const { error } = await (supabase as any)
    .from('knowledge_entries').update(update).eq('id', id)
  if (error) throw new Error('Failed to update: ' + error.message)
  if (entitySet !== undefined) await setEntryEntities(supabase, id, org_id, entitySet)
  revalidatePath('/dashboard/knowledge')
  revalidatePath(`/dashboard/knowledge/${id}`)
}

export async function deleteEntry(id: string) {
  const { supabase } = await getCtx()
  const { error } = await (supabase as any)
    .from('knowledge_entries').delete().eq('id', id)
  if (error) throw new Error('Failed to delete: ' + error.message)
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
    (supabase as any).from('knowledge_entries').select('kind, entity').eq('access', 'standard').eq('status', 'active'),
    (supabase as any).from('knowledge_entries').select('id', { count: 'exact', head: true }).eq('kind', 'idea').eq('idea_status', 'raw').eq('status', 'active'),
    (supabase as any).from('knowledge_entries').select('id', { count: 'exact', head: true }).eq('access', 'standard').gte('updated_at', sevenDaysAgo),
  ])
  const rows = (allRes.data ?? []) as { kind: string; entity: string }[]
  const byKind: Record<string, number> = {}
  const byEntity: Record<string, number> = {}
  rows.forEach(r => {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1
    byEntity[r.entity] = (byEntity[r.entity] ?? 0) + 1
  })
  return {
    total: rows.length,
    byKind,
    byEntity,
    rawIdeas: rawRes.count ?? 0,
    recentCount: recentRes.count ?? 0,
  }
}

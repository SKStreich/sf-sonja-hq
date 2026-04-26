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

const KINDS = ['idea', 'doc', 'chat', 'note', 'critique', 'workspace'] as const
export type Kind = typeof KINDS[number]

const ENTITIES_CONST = ['tm', 'sf', 'sfe', 'personal'] as const
export type Entity = typeof ENTITIES_CONST[number]

const TYPE_HINTS_CONST = ['decision', 'strategy', 'primer', 'brand', 'marketing', 'business', 'idea'] as const
export type TypeHint = typeof TYPE_HINTS_CONST[number]

const IDEA_STATUSES_CONST = ['raw', 'developing', 'approved', 'shipped', 'parked'] as const
export type IdeaStatus = typeof IDEA_STATUSES_CONST[number]

export interface KnowledgeEntry {
  id: string
  kind: Kind | 'vault'
  access: 'standard' | 'vault'
  entity: Entity
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
  if (opts.entity) q = q.eq('entity', opts.entity)
  if (opts.query && opts.query.trim()) {
    const needle = `%${opts.query.trim()}%`
    q = q.or(`title.ilike.${needle},body.ilike.${needle}`)
  }
  const { data, error } = await q
  if (error) throw new Error('Failed to list entries: ' + error.message)
  return (data ?? []) as KnowledgeEntry[]
}

export async function getEntry(id: string): Promise<KnowledgeEntry | null> {
  const { supabase } = await getCtx()
  const { data } = await (supabase as any)
    .from('knowledge_entries').select('*').eq('id', id).maybeSingle()
  return (data ?? null) as KnowledgeEntry | null
}

async function classify(body: string, entityHint: Entity): Promise<{
  title: string; type_hint: TypeHint; tags: string[]; confidence: number; summary: string | null
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return {
      title: body.split('\n')[0].slice(0, 120),
      type_hint: 'strategy',
      tags: [],
      confidence: 0.3,
      summary: null,
    }
  }
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
  const text = res.content[0].type === 'text' ? res.content[0].text : '{}'
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  try {
    const p = JSON.parse(jsonStr)
    const type_hint: TypeHint = (TYPE_HINTS_CONST as readonly string[]).includes(p.type_hint) ? p.type_hint : 'strategy'
    return {
      title: String(p.title ?? '').slice(0, 120) || body.split('\n')[0].slice(0, 120),
      type_hint,
      tags: Array.isArray(p.tags) ? p.tags.map((t: any) => String(t).toLowerCase()).slice(0, 8) : [],
      confidence: typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.5,
      summary: typeof p.summary === 'string' ? p.summary.slice(0, 200) : null,
    }
  } catch {
    return { title: body.split('\n')[0].slice(0, 120), type_hint: 'strategy', tags: [], confidence: 0.3, summary: null }
  }
}

export async function createEntry(input: {
  body: string
  entity: Entity
  kind?: Kind
  title?: string
  type_hint?: TypeHint
  tags?: string[]
}): Promise<{ id: string }> {
  const { supabase, user, org_id } = await getCtx()
  const body = input.body?.trim()
  if (!body) throw new Error('Body is required')
  if (!(ENTITIES_CONST as readonly string[]).includes(input.entity)) throw new Error('Invalid entity')

  const kind: Kind = input.kind ?? 'note'

  let classified = { title: '', type_hint: 'strategy' as TypeHint, tags: [] as string[], confidence: 0.5, summary: null as string | null }
  if (!input.title || !input.type_hint) {
    classified = await classify(body, input.entity)
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
      entity: input.entity,
      title, body, summary,
      type_hint, idea_status,
      tags, confidence,
      source: 'manual',
    })
    .select('id')
    .single()
  if (error) throw new Error('Failed to create entry: ' + error.message)
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
  entity?: Entity
  status?: 'active' | 'archived'
}) {
  const { supabase, user } = await getCtx()
  const current = await getEntry(id)
  if (!current) throw new Error('Entry not found')

  const changed = (field: keyof typeof patch, cur: any) =>
    patch[field] !== undefined && JSON.stringify(patch[field]) !== JSON.stringify(cur)

  const anyContentChanged =
    changed('title', current.title) ||
    changed('body', current.body) ||
    changed('kind', current.kind) ||
    changed('entity', current.entity) ||
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
  if (patch.entity !== undefined) update.entity = patch.entity
  if (patch.status !== undefined) update.status = patch.status

  const { error } = await (supabase as any)
    .from('knowledge_entries').update(update).eq('id', id)
  if (error) throw new Error('Failed to update: ' + error.message)
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

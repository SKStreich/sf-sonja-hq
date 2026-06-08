'use server'
/**
 * Merge Knowledge Entries (spec `hq_merge-entries_v2.html`).
 *
 * Combine 2+ standard entries into ONE new entry, with Claude drafting a
 * lossless union you review before saving. Vault is never read (and never a
 * source). Sources are archived + linked `merged_into` — recoverable (OQ6).
 *
 * No migration: `merged_into` is already an allowed `knowledge_links` relation.
 * Pure helpers (union math, prompt, parsing, re-parent rules) live in
 * `@/lib/knowledge/merge-core` so they can be unit-tested without a client.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicApiKey } from '@/lib/anthropic-key'
import { fetchEntryEntityMap, setEntryEntities, sortEntitySlugs } from '@/lib/entities/multi-entity'
import { ENTITY_SLUGS } from '@/lib/entities/config'
import {
  MERGE_MODEL, MERGE_MAX_TOKENS, MERGE_KINDS, MERGE_TYPE_HINTS,
  type MergeSource, type MergeKind, type MergeTypeHint,
  unionMergeEntities, unionMergeTags, assembleSourceText,
  buildMergePrompt, parseMergeResponse, fallbackMergeDraft,
  hasWorkspaceSource, resolveMergeKind, resolveMergeParentId,
} from '@/lib/knowledge/merge-core'

async function getCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

/**
 * Load the requested entries as merge sources, enforcing eligibility:
 *  - all must exist in the caller's org and be active,
 *  - none may be vault (Claude never reads vault),
 *  - at least 2 distinct entries.
 * Returns sources in the order ids were given (stable for the draft).
 */
async function loadMergeSources(ids: string[]): Promise<{ supabase: any; user: any; org_id: string; sources: MergeSource[] }> {
  const { supabase, user, org_id } = await getCtx()
  const unique = Array.from(new Set(ids.filter(Boolean)))
  if (unique.length < 2) throw new Error('Select at least two entries to merge')

  const { data, error } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, title, kind, access, status, org_id, entity, tags, body, parent_id')
    .in('id', unique)
  if (error) throw new Error('Failed to load merge sources: ' + error.message)

  const rows = (data ?? []) as any[]
  if (rows.some(r => r.org_id !== org_id)) throw new Error('An entry is in a different org')
  if (rows.some(r => r.access === 'vault')) throw new Error('Vault entries cannot be merged')
  if (rows.some(r => r.status !== 'active')) throw new Error('Only active entries can be merged')
  if (rows.length < 2) throw new Error('Some selected entries no longer exist')

  const entityMap = await fetchEntryEntityMap(supabase, rows.map(r => r.id))
  const byId = new Map(rows.map(r => [r.id, r]))
  const sources: MergeSource[] = unique
    .map(id => byId.get(id))
    .filter(Boolean)
    .map((r: any) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      entities: (entityMap[r.id] ?? [r.entity]).filter((e: string) => (ENTITY_SLUGS as readonly string[]).includes(e)),
      tags: Array.isArray(r.tags) ? r.tags : [],
      body: r.body,
      parent_id: r.parent_id ?? null,
    }))
  if (sources.length < 2) throw new Error('Some selected entries no longer exist')
  return { supabase, user, org_id, sources }
}

/** Union of the projects all sources are attached to (relation='attached'). */
async function unionAttachedProjects(supabase: any, org_id: string, sourceIds: string[]): Promise<string[]> {
  const { data } = await (supabase as any)
    .from('knowledge_links')
    .select('to_project, projects:to_project(id, org_id, archived)')
    .in('from_entry', sourceIds)
    .eq('relation', 'attached')
    .not('to_project', 'is', null)
  const set = new Set<string>()
  ;(data ?? []).forEach((row: any) => {
    const p = row.projects
    if (!p || p.org_id !== org_id || p.archived) return
    set.add(p.id)
  })
  return Array.from(set)
}

export interface MergeDraft {
  sourceIds: string[]
  sources: { id: string; title: string | null; kind: string }[]
  title: string
  body: string
  kind: MergeKind
  type_hint: MergeTypeHint
  entities: string[]
  tags: string[]
  projectIds: string[]
  truncated: boolean
  hasWorkspaceSource: boolean
}

/**
 * Draft a merged entry from `ids` (≥2). Reads source bodies, asks Claude for a
 * lossless union, and computes the union metadata (entities/tags/projects).
 * Writes nothing — the caller reviews + edits, then calls `commitMerge`.
 */
export async function draftMerge(ids: string[]): Promise<MergeDraft> {
  const { supabase, org_id, sources } = await loadMergeSources(ids)

  const { text, truncated } = assembleSourceText(sources)
  const apiKey = getAnthropicApiKey()

  let drafted
  if (!apiKey) {
    drafted = fallbackMergeDraft(sources)
  } else {
    try {
      const client = new Anthropic({ apiKey })
      const res = await client.messages.create({
        model: MERGE_MODEL,
        max_tokens: MERGE_MAX_TOKENS,
        messages: [{ role: 'user', content: buildMergePrompt(text) }],
      })
      const raw = res.content[0]?.type === 'text' ? res.content[0].text : ''
      drafted = parseMergeResponse(raw)
    } catch (err) {
      console.error('[draftMerge] Anthropic call failed; using deterministic fallback:', err)
      drafted = fallbackMergeDraft(sources)
    }
  }

  const projectIds = await unionAttachedProjects(supabase, org_id, sources.map(s => s.id))

  return {
    sourceIds: sources.map(s => s.id),
    sources: sources.map(s => ({ id: s.id, title: s.title, kind: s.kind })),
    title: drafted.title,
    body: drafted.body,
    kind: resolveMergeKind(sources, drafted.type_hint === 'idea' ? 'idea' : null),
    type_hint: drafted.type_hint,
    entities: unionMergeEntities(sources),
    tags: unionMergeTags(sources),
    projectIds,
    truncated,
    hasWorkspaceSource: hasWorkspaceSource(sources),
  }
}

export interface CommitMergeInput {
  sourceIds: string[]
  title: string
  body: string
  kind?: MergeKind
  type_hint?: MergeTypeHint | null
  /** ≥1 (the union, possibly trimmed in review). */
  entities: string[]
  tags?: string[]
  /** Projects to attach to the merged result. */
  projectIds?: string[]
}

/**
 * Persist a reviewed merge: insert the new entry, set its entities, attach
 * projects, re-parent any workspace children onto it, link each source
 * `merged_into` the result, and archive the sources. Returns the new entry id.
 */
export async function commitMerge(input: CommitMergeInput): Promise<{ id: string }> {
  const { supabase, user, org_id, sources } = await loadMergeSources(input.sourceIds)

  const body = input.body?.trim()
  if (!body) throw new Error('Merged body is required')

  const requested = sortEntitySlugs(input.entities ?? [])
  if (requested.length === 0) throw new Error('At least one entity is required')
  if (!requested.every(e => (ENTITY_SLUGS as readonly string[]).includes(e))) throw new Error('Invalid entity')
  const primary = requested[0]

  // Workspace sources force kind=workspace so the merged page can hold the
  // re-parented subtree; otherwise honor the reviewed kind.
  const kind: MergeKind = resolveMergeKind(sources, input.kind ?? null)
  const parent_id = resolveMergeParentId(sources)
  const type_hint: MergeTypeHint =
    input.type_hint && (MERGE_TYPE_HINTS as readonly string[]).includes(input.type_hint)
      ? input.type_hint
      : 'strategy'
  const tags = (input.tags ?? []).map(t => String(t).toLowerCase()).slice(0, 16)
  const title = (input.title?.trim() || 'Merged entry').slice(0, 120)
  const idea_status = kind === 'idea' ? 'raw' : null

  // 1. Insert the merged entry.
  const { data: created, error: insErr } = await (supabase as any)
    .from('knowledge_entries')
    .insert({
      org_id, user_id: user.id,
      kind, access: 'standard',
      entity: primary,
      title, body, summary: null,
      type_hint, idea_status,
      tags, confidence: null,
      source: 'merge',
      parent_id,
    })
    .select('id')
    .single()
  if (insErr) throw new Error('Failed to create merged entry: ' + insErr.message)
  const newId = created.id as string

  // 2. Entities (junction).
  await setEntryEntities(supabase, newId, org_id, requested)

  // 3. Attach the union of projects (dedupe vs the new entry's own org checks).
  const projectIds = Array.from(new Set(input.projectIds ?? []))
  for (const projectId of projectIds) {
    const { error: attErr } = await (supabase as any).from('knowledge_links').insert({
      from_entry: newId, to_entry: null, to_project: projectId, to_task: null,
      relation: 'attached', created_by: user.id,
    })
    if (attErr && attErr.code !== '23505') {
      throw new Error('Failed to attach project to merged entry: ' + attErr.message)
    }
  }

  // 4. Re-parent workspace children + link + archive each source.
  for (const s of sources) {
    if (s.kind === 'workspace') {
      const { error: rpErr } = await (supabase as any)
        .from('knowledge_entries')
        .update({ parent_id: newId })
        .eq('parent_id', s.id)
        .eq('org_id', org_id)
      if (rpErr) throw new Error('Failed to re-parent workspace children: ' + rpErr.message)
    }
    const { error: linkErr } = await (supabase as any).from('knowledge_links').insert({
      from_entry: s.id, to_entry: newId, to_project: null, to_task: null,
      relation: 'merged_into', created_by: user.id,
    })
    if (linkErr && linkErr.code !== '23505') {
      throw new Error('Failed to link merged source: ' + linkErr.message)
    }
    const { error: arcErr } = await (supabase as any)
      .from('knowledge_entries')
      .update({ status: 'archived' })
      .eq('id', s.id)
    if (arcErr) throw new Error('Failed to archive merged source: ' + arcErr.message)
  }

  revalidatePath('/dashboard/knowledge')
  revalidatePath(`/dashboard/knowledge/${newId}`)
  return { id: newId }
}

export interface MergedRef {
  linkId: string
  id: string
  title: string | null
  kind: string
}

/**
 * Sources that were merged INTO `entryId` (for the "Merged from (N)" block on
 * the result). Archived sources are included — that's the whole point.
 */
export async function getMergedFrom(entryId: string): Promise<MergedRef[]> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_links')
    .select('id, from_entry, knowledge_entries!knowledge_links_from_entry_fkey(id, title, kind, org_id)')
    .eq('to_entry', entryId)
    .eq('relation', 'merged_into')
  if (error) throw new Error('Failed to load merge sources: ' + error.message)
  const out: MergedRef[] = []
  ;(data ?? []).forEach((row: any) => {
    const e = row.knowledge_entries
    if (!e || e.org_id !== org_id) return
    out.push({ linkId: row.id, id: e.id, title: e.title, kind: e.kind })
  })
  return out
}

/**
 * The entry `entryId` was merged INTO (for the "Merged into X" banner on an
 * archived source), or null if it wasn't a merge source.
 */
export async function getMergedInto(entryId: string): Promise<MergedRef | null> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_links')
    .select('id, to_entry, knowledge_entries!knowledge_links_to_entry_fkey(id, title, kind, org_id)')
    .eq('from_entry', entryId)
    .eq('relation', 'merged_into')
    .maybeSingle()
  if (error) throw new Error('Failed to load merge target: ' + error.message)
  if (!data) return null
  const e = data.knowledge_entries
  if (!e || e.org_id !== org_id) return null
  return { linkId: data.id, id: e.id, title: e.title, kind: e.kind }
}

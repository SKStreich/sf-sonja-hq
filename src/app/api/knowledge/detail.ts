'use server'
/**
 * Entry detail actions: versioning (list / restore), related links (critiques
 * and follow-up notes), and saving AI critiques as first-class entries.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'
import { updateEntry, type Kind, type Entity, type KnowledgeEntry } from './actions'

async function getCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

export interface EntryVersion {
  id: string
  entry_id: string
  version: number
  title: string | null
  body: string | null
  kind: string | null
  entity: string | null
  tags: string[] | null
  summary: string | null
  type_hint: string | null
  idea_status: string | null
  created_at: string
  created_by: string | null
}

export async function listVersions(entryId: string): Promise<EntryVersion[]> {
  const { supabase } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_versions')
    .select('*')
    .eq('entry_id', entryId)
    .order('version', { ascending: false })
  if (error) throw new Error('Failed to list versions: ' + error.message)
  return (data ?? []) as EntryVersion[]
}

/**
 * Restore prior version: snapshots current state (via updateEntry), then
 * applies the version's snapshot to the live entry.
 */
export async function restoreVersion(versionId: string): Promise<void> {
  const { supabase } = await getCtx()
  const { data: v, error } = await (supabase as any)
    .from('knowledge_versions').select('*').eq('id', versionId).maybeSingle()
  if (error || !v) throw new Error('Version not found')

  await updateEntry(v.entry_id as string, {
    title: v.title,
    body: v.body,
    kind: (v.kind ?? undefined) as Kind | undefined,
    entity: (v.entity ?? undefined) as Entity | undefined,
    tags: v.tags ?? [],
    type_hint: v.type_hint ?? null,
    idea_status: v.idea_status ?? null,
  })
  revalidatePath(`/dashboard/knowledge/${v.entry_id}`)
}

export interface RelatedEntry {
  link_id: string
  relation: string
  entry: KnowledgeEntry
  created_at: string
}

/**
 * Fetch entries linked *from* a given entry by a specific relation (e.g.
 * critiques attached to this entry, follow-up notes, etc).
 */
export async function listRelated(entryId: string, relation?: string): Promise<RelatedEntry[]> {
  const { supabase } = await getCtx()
  let q = (supabase as any)
    .from('knowledge_links')
    .select('id, relation, created_at, from_entry, to_entry, knowledge_entries!knowledge_links_from_entry_fkey(*)')
    .eq('to_entry', entryId)
    .order('created_at', { ascending: false })
  if (relation) q = q.eq('relation', relation)
  const { data, error } = await q
  if (error) {
    // fallback: fetch links then entries (if FK alias isn't set up)
    const { data: links } = await (supabase as any)
      .from('knowledge_links')
      .select('id, relation, created_at, from_entry')
      .eq('to_entry', entryId)
      .order('created_at', { ascending: false })
    if (!links) return []
    const ids = links.filter((l: any) => !relation || l.relation === relation).map((l: any) => l.from_entry)
    if (ids.length === 0) return []
    const { data: entries } = await (supabase as any)
      .from('knowledge_entries').select('*').in('id', ids)
    const byId = Object.fromEntries((entries ?? []).map((e: any) => [e.id, e]))
    return links
      .filter((l: any) => byId[l.from_entry] && (!relation || l.relation === relation))
      .map((l: any) => ({
        link_id: l.id, relation: l.relation, created_at: l.created_at,
        entry: byId[l.from_entry] as KnowledgeEntry,
      }))
  }
  return (data ?? []).map((row: any) => ({
    link_id: row.id,
    relation: row.relation,
    created_at: row.created_at,
    entry: row.knowledge_entries as KnowledgeEntry,
  })) as RelatedEntry[]
}

/**
 * Run Claude critique on an entry and persist the result as a kind='critique'
 * entry linked back via relation='critique_of'. Returns the new critique id.
 */
export async function critiqueAndSave(entryId: string): Promise<{ id: string }> {
  const { supabase, user, org_id } = await getCtx()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const { data: entry } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, title, body, summary, kind, entity, access, tags')
    .eq('id', entryId).maybeSingle()
  if (!entry) throw new Error('Entry not found')
  if (entry.access === 'vault') throw new Error('Vault entries cannot be critiqued')

  const { data: neighbors } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, title, summary, kind, entity')
    .eq('org_id', org_id)
    .eq('access', 'standard')
    .eq('status', 'active')
    .neq('id', entryId)
    .neq('kind', 'critique')
    .order('updated_at', { ascending: false })
    .limit(20)

  const neighborText = (neighbors ?? []).map((n: any) =>
    `- [${n.kind}/${n.entity}] ${n.title ?? '(untitled)'} — ${n.summary ?? ''}`
  ).join('\n')

  const client = new Anthropic({ apiKey })
  const model = 'claude-sonnet-4-6'
  const prompt = `Critique the following entry in Markdown. Structure:

## Summary
One sentence restating the core idea.

## Strengths
- bullets

## Concerns
- bullets (flaws, risks, weak assumptions)

## Missing / Questions
- bullets (gaps, unresolved questions)

## Related work in the hub
- bullets referencing neighbors by title if genuinely related

ENTRY
kind: ${entry.kind}
entity: ${entry.entity}
title: ${entry.title ?? '(untitled)'}
tags: ${(entry.tags ?? []).join(', ')}
body:
${(entry.body ?? entry.summary ?? '').slice(0, 6000)}

NEIGHBORS (may be related):
${neighborText || '(none)'}`

  const res = await client.messages.create({
    model,
    max_tokens: 1200,
    messages: [{ role: 'user', content: prompt }],
  })
  const markdown = res.content[0].type === 'text' ? res.content[0].text : '(no critique generated)'

  const { data: inserted, error: insertError } = await (supabase as any)
    .from('knowledge_entries')
    .insert({
      org_id, user_id: user.id,
      kind: 'critique', access: 'standard',
      entity: entry.entity,
      title: `Critique — ${entry.title ?? '(untitled)'} (${new Date().toLocaleDateString()})`,
      body: markdown,
      source: 'manual',
      tags: ['critique'],
    })
    .select('id').single()
  if (insertError) throw new Error('Failed to save critique: ' + insertError.message)

  const { error: linkError } = await (supabase as any).from('knowledge_links').insert({
    from_entry: inserted.id,
    to_entry: entryId,
    relation: 'critique_of',
    created_by: user.id,
  })
  if (linkError) throw new Error('Critique saved but link failed: ' + linkError.message)

  revalidatePath(`/dashboard/knowledge/${entryId}`)
  return { id: inserted.id as string }
}

/**
 * Add a follow-up note to an entry. Creates a kind='note' entry linked via
 * relation='note_on' back to the source entry.
 */
export async function addFollowUpNote(entryId: string, body: string): Promise<{ id: string }> {
  const { supabase, user, org_id } = await getCtx()
  const text = body.trim()
  if (!text) throw new Error('Note body required')

  const { data: src } = await (supabase as any)
    .from('knowledge_entries').select('entity, title, access').eq('id', entryId).maybeSingle()
  if (!src) throw new Error('Source entry not found')
  if (src.access === 'vault') throw new Error('Cannot annotate vault entries here')

  const { data: inserted, error } = await (supabase as any)
    .from('knowledge_entries')
    .insert({
      org_id, user_id: user.id,
      kind: 'note', access: 'standard',
      entity: src.entity,
      title: `Note on ${src.title ?? '(untitled)'}`,
      body: text,
      source: 'manual',
      tags: ['followup'],
    })
    .select('id').single()
  if (error) throw new Error('Failed to create note: ' + error.message)

  const { error: linkError } = await (supabase as any).from('knowledge_links').insert({
    from_entry: inserted.id, to_entry: entryId,
    relation: 'note_on', created_by: user.id,
  })
  if (linkError) throw new Error('Note saved but link failed: ' + linkError.message)
  revalidatePath(`/dashboard/knowledge/${entryId}`)
  return { id: inserted.id as string }
}

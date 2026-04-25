'use server'
/**
 * Knowledge Insights — cheap duplicate detection + AI critique.
 *
 * Uses pg_trgm similarity on title+body (no embeddings yet). Claude critique
 * is on-demand and operates on a single entry.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'

function canonicalPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export interface DuplicatePair {
  a_id: string
  a_title: string | null
  a_kind: string
  a_entity: string
  b_id: string
  b_title: string | null
  b_kind: string
  b_entity: string
  similarity: number
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

/**
 * Find pairs of standard entries whose combined title+body are highly similar.
 * Uses pg_trgm similarity() on the shorter of title/body per row. Threshold
 * default 0.35 — tuned for "probably worth a look" rather than exact dupes.
 */
export async function findDuplicatePairs(threshold = 0.35, limit = 20): Promise<DuplicatePair[]> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any).rpc('knowledge_find_duplicate_pairs', {
    p_org_id: org_id,
    p_threshold: threshold,
    p_limit: limit,
  })
  if (error) {
    // If the RPC isn't installed yet, return empty rather than throw so the UI still renders.
    console.warn('findDuplicatePairs: RPC missing or failed:', error.message)
    return []
  }
  const all = (data ?? []) as DuplicatePair[]
  if (all.length === 0) return all

  // Filter out user-dismissed pairs (compare with canonical-ordered ids).
  const { data: dismissed } = await (supabase as any)
    .from('knowledge_duplicate_dismissals')
    .select('entry_a_id, entry_b_id')
    .eq('org_id', org_id)
  const blocked = new Set<string>()
  for (const d of dismissed ?? []) blocked.add(`${d.entry_a_id}|${d.entry_b_id}`)
  return all.filter(p => {
    const [x, y] = canonicalPair(p.a_id, p.b_id)
    return !blocked.has(`${x}|${y}`)
  })
}

export interface PairBodies {
  a: { id: string; title: string | null; body: string | null; updated_at: string }
  b: { id: string; title: string | null; body: string | null; updated_at: string }
}

export async function getPairBodies(aId: string, bId: string): Promise<PairBodies | null> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, title, body, updated_at')
    .in('id', [aId, bId])
    .eq('org_id', org_id)
  if (error || !data || data.length !== 2) return null
  const a = data.find((r: any) => r.id === aId)
  const b = data.find((r: any) => r.id === bId)
  if (!a || !b) return null
  return {
    a: { id: a.id, title: a.title, body: (a.body ?? '').slice(0, 4000), updated_at: a.updated_at },
    b: { id: b.id, title: b.title, body: (b.body ?? '').slice(0, 4000), updated_at: b.updated_at },
  }
}

/**
 * Flag a pair as "not actually duplicate" so it stops appearing in the
 * Possible Duplicates panel for everyone in the org.
 */
export async function dismissDuplicatePair(aId: string, bId: string): Promise<void> {
  const { supabase, user, org_id } = await getCtx()
  const [entry_a_id, entry_b_id] = canonicalPair(aId, bId)
  const { error } = await (supabase as any)
    .from('knowledge_duplicate_dismissals')
    .upsert({ org_id, entry_a_id, entry_b_id, dismissed_by: user.id },
            { onConflict: 'org_id,entry_a_id,entry_b_id', ignoreDuplicates: true })
  if (error) throw new Error('Failed to dismiss pair: ' + error.message)
  revalidatePath('/dashboard/knowledge')
}

/**
 * Merge two near-duplicate entries: keep `keepId`, archive `removeId`.
 * - Tags are unioned.
 * - If `keepId.body` is empty/short, fill from removeId.
 * - Inserts a 'superseded_by' link from keepId → removeId so the merge is auditable.
 */
export async function mergeDuplicateEntries(
  keepId: string,
  removeId: string,
): Promise<{ kept: string; removed: string }> {
  if (keepId === removeId) throw new Error('Cannot merge an entry with itself')
  const { supabase, user, org_id } = await getCtx()

  const { data: rows, error } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, title, body, tags, summary, access, status, org_id')
    .in('id', [keepId, removeId])
  if (error) throw new Error('Failed to load entries: ' + error.message)
  if (!rows || rows.length !== 2) throw new Error('Both entries must exist')
  const keep = rows.find((r: any) => r.id === keepId)
  const remove = rows.find((r: any) => r.id === removeId)
  if (!keep || !remove) throw new Error('Both entries must exist')
  if (keep.org_id !== org_id || remove.org_id !== org_id) throw new Error('Cross-org merge not allowed')
  if (keep.access === 'vault' || remove.access === 'vault') throw new Error('Vault entries cannot be merged here')

  const mergedTags = Array.from(new Set([...(keep.tags ?? []), ...(remove.tags ?? [])])).slice(0, 12)
  const keepBody = (keep.body ?? '').trim()
  const removeBody = (remove.body ?? '').trim()
  const newBody = keepBody.length >= 200 ? keepBody : (removeBody || keepBody) || null
  const newSummary = keep.summary || remove.summary || null

  const { error: uErr } = await (supabase as any)
    .from('knowledge_entries')
    .update({ body: newBody, tags: mergedTags, summary: newSummary, updated_at: new Date().toISOString() })
    .eq('id', keepId)
  if (uErr) throw new Error('Failed to update kept entry: ' + uErr.message)

  const { error: aErr } = await (supabase as any)
    .from('knowledge_entries')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('id', removeId)
  if (aErr) throw new Error('Failed to archive removed entry: ' + aErr.message)

  await (supabase as any).from('knowledge_links').insert({
    from_entry: keepId, to_entry: removeId,
    relation: 'superseded_by', created_by: user.id,
  })

  revalidatePath('/dashboard/knowledge')
  revalidatePath(`/dashboard/knowledge/${keepId}`)
  revalidatePath(`/dashboard/knowledge/${removeId}`)
  return { kept: keepId, removed: removeId }
}

export interface EntryCritique {
  entry_id: string
  summary: string
  strengths: string[]
  concerns: string[]
  missing: string[]
  related_ids: string[]
  model: string
}

/**
 * Ask Claude to critique a single entry: strengths, concerns, gaps, and
 * pointers to related entries in the same org. Vault entries are rejected.
 */
export async function critiqueEntry(id: string): Promise<EntryCritique> {
  const { supabase, org_id } = await getCtx()
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const { data: entry, error } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, title, body, summary, kind, entity, access, tags')
    .eq('id', id)
    .maybeSingle()
  if (error || !entry) throw new Error('Entry not found')
  if (entry.access === 'vault') throw new Error('Vault entries cannot be critiqued')

  // Pull a few neighbors in the same org to let Claude reference them.
  const { data: neighbors } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, title, summary, kind, entity')
    .eq('org_id', org_id)
    .eq('access', 'standard')
    .eq('status', 'active')
    .neq('id', id)
    .order('updated_at', { ascending: false })
    .limit(20)

  const neighborText = (neighbors ?? []).map((n: any, i: number) =>
    `[${i}] id=${n.id} kind=${n.kind} entity=${n.entity} title=${n.title ?? '(untitled)'} — ${n.summary ?? ''}`
  ).join('\n')

  const client = new Anthropic({ apiKey })
  const model = 'claude-sonnet-4-6'
  const prompt = `You are reviewing one entry from a personal knowledge base. Respond ONLY with JSON:
{
  "summary": "one-sentence restatement (max 160 chars)",
  "strengths": ["short bullets"],
  "concerns": ["flaws, risks, weak assumptions"],
  "missing": ["gaps or questions to resolve"],
  "related_ids": ["entry ids from the neighbors list that appear to cover the same idea or strongly related work"]
}

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
    max_tokens: 800,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = res.content[0].type === 'text' ? res.content[0].text : '{}'
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()
  let parsed: any = {}
  try { parsed = JSON.parse(jsonStr) } catch { /* fall through */ }

  return {
    entry_id: id,
    summary: typeof parsed.summary === 'string' ? parsed.summary.slice(0, 240) : '',
    strengths: Array.isArray(parsed.strengths) ? parsed.strengths.map(String).slice(0, 8) : [],
    concerns: Array.isArray(parsed.concerns) ? parsed.concerns.map(String).slice(0, 8) : [],
    missing: Array.isArray(parsed.missing) ? parsed.missing.map(String).slice(0, 8) : [],
    related_ids: Array.isArray(parsed.related_ids) ? parsed.related_ids.map(String).slice(0, 10) : [],
    model,
  }
}

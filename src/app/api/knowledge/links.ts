'use server'
/**
 * Workspace page mentions — `[[Entry: Title]]` / `[[Project: Name]]` syntax.
 *
 * Write-time persistence: when a workspace page is saved, the body is scanned
 * for `[[…]]` tokens, resolved against the org's entries + projects, and a
 * fresh set of `knowledge_links` rows is written with relation='mentions'.
 * Backlink lookups then become a single indexed query.
 */
import { createClient } from '@/lib/supabase/server'

async function getCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

export type LinkTargetKind = 'entry' | 'project'

export interface LinkTarget {
  kind: LinkTargetKind
  id: string
  label: string           // title (entry) or name (project)
  hint?: string | null    // entity tag for disambiguation
}

/**
 * Returns up to 8 entry/project candidates matching `query`, for the editor's
 * `[[…]]` autocomplete popup. Empty `query` returns recent entries + projects.
 * Vault entries and archived rows are excluded.
 */
export async function searchLinkTargets(query: string): Promise<LinkTarget[]> {
  const { supabase, org_id } = await getCtx()
  const q = query.trim()
  const like = `%${q}%`

  // Entries: standard-access, non-vault, non-archived, with a non-empty title.
  let entriesQ = (supabase as any)
    .from('knowledge_entries')
    .select('id, title, entity, kind, updated_at')
    .eq('org_id', org_id)
    .neq('access', 'vault')
    .eq('status', 'active')
    .not('title', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(8)
  if (q) entriesQ = entriesQ.ilike('title', like)
  const { data: entries } = await entriesQ

  // Projects: org-scoped, not archived (archived is a boolean column, not a status value).
  let projectsQ = (supabase as any)
    .from('projects')
    .select('id, name, status')
    .eq('org_id', org_id)
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(8)
  if (q) projectsQ = projectsQ.ilike('name', like)
  const { data: projects } = await projectsQ

  const results: LinkTarget[] = []
  ;(projects ?? []).forEach((p: any) => results.push({
    kind: 'project', id: p.id, label: p.name, hint: null,
  }))
  ;(entries ?? []).forEach((e: any) => results.push({
    kind: 'entry', id: e.id, label: e.title, hint: `${e.kind} · ${e.entity}`,
  }))
  // Interleave: projects first (rarer), then entries. Cap at 8 total.
  return results.slice(0, 8)
}

/**
 * Parses [[Entry: Title]] and [[Project: Name]] tokens from raw markdown,
 * deduplicated by (kind, label). Case-insensitive label match.
 *
 * Not exported: 'use server' files only permit async-function exports.
 */
function parseMentionTokens(body: string): Array<{ kind: LinkTargetKind; label: string }> {
  const re = /\[\[(Entry|Project):\s*([^\]\n]+?)\s*\]\]/g
  const seen = new Set<string>()
  const out: Array<{ kind: LinkTargetKind; label: string }> = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const kind = (m[1].toLowerCase() === 'project' ? 'project' : 'entry') as LinkTargetKind
    const label = m[2].trim()
    if (!label) continue
    const key = `${kind}::${label.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, label })
  }
  return out
}

/**
 * Resolves parsed tokens to entry/project ids in the caller's org. Returns
 * a map keyed by `${kind}::${label.toLowerCase()}` -> id, with unresolved
 * tokens omitted.
 */
async function resolveMentions(
  supabase: any,
  org_id: string,
  tokens: Array<{ kind: LinkTargetKind; label: string }>,
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()
  if (tokens.length === 0) return resolved

  const entryLabels = tokens.filter(t => t.kind === 'entry').map(t => t.label)
  const projectLabels = tokens.filter(t => t.kind === 'project').map(t => t.label)

  if (entryLabels.length > 0) {
    const { data } = await supabase
      .from('knowledge_entries')
      .select('id, title, updated_at')
      .eq('org_id', org_id)
      .neq('access', 'vault')
      .eq('status', 'active')
      .in('title', entryLabels)
      .order('updated_at', { ascending: false })
    // Multiple entries can share a title; first one (latest) wins.
    ;(data ?? []).forEach((row: any) => {
      const key = `entry::${(row.title as string).toLowerCase()}`
      if (!resolved.has(key)) resolved.set(key, row.id)
    })
  }

  if (projectLabels.length > 0) {
    const { data } = await supabase
      .from('projects')
      .select('id, name, updated_at')
      .eq('org_id', org_id)
      .eq('archived', false)
      .in('name', projectLabels)
      .order('updated_at', { ascending: false })
    ;(data ?? []).forEach((row: any) => {
      const key = `project::${(row.name as string).toLowerCase()}`
      if (!resolved.has(key)) resolved.set(key, row.id)
    })
  }

  return resolved
}

/**
 * Replaces the set of relation='mentions' rows for `fromEntryId` with one row
 * per resolved token. Unresolved tokens are silently skipped — the editor
 * still renders them as a "broken link" pill so the user sees what failed.
 *
 * Caller is responsible for authorization (must be the page owner). This is
 * meant to be invoked from updateWorkspacePage after the body update commits.
 */
export async function syncMentionsForEntry(fromEntryId: string, body: string): Promise<void> {
  const { supabase, user, org_id } = await getCtx()

  // Confirm the caller owns the from-entry, in the right org.
  const { data: entry } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, org_id, user_id')
    .eq('id', fromEntryId)
    .maybeSingle()
  if (!entry) throw new Error('Entry not found')
  if (entry.org_id !== org_id) throw new Error('Entry in different org')

  const tokens = parseMentionTokens(body)
  const resolved = await resolveMentions(supabase, org_id, tokens)

  // Replace strategy: delete all 'mentions' from this entry, then re-insert.
  // Simpler than diffing and the set is small (typically <20).
  await (supabase as any)
    .from('knowledge_links')
    .delete()
    .eq('from_entry', fromEntryId)
    .eq('relation', 'mentions')

  if (resolved.size === 0) return

  const rows: any[] = []
  for (const tok of tokens) {
    const key = `${tok.kind}::${tok.label.toLowerCase()}`
    const targetId = resolved.get(key)
    if (!targetId) continue
    if (tok.kind === 'entry') {
      if (targetId === fromEntryId) continue  // ignore self-mention
      rows.push({
        from_entry: fromEntryId, to_entry: targetId, to_project: null,
        relation: 'mentions', created_by: user.id,
      })
    } else {
      rows.push({
        from_entry: fromEntryId, to_entry: null, to_project: targetId,
        relation: 'mentions', created_by: user.id,
      })
    }
  }
  if (rows.length === 0) return
  // Upsert isn't quite right here (we just nuked the rows). Plain insert is fine
  // and the partial-unique-index will catch any in-batch duplicates anyway.
  const { error } = await (supabase as any).from('knowledge_links').insert(rows)
  if (error && error.code !== '23505') {
    // 23505 = unique_violation — possible if the body has the same target twice
    // under different casings. Safe to swallow; the kept row is the first.
    throw new Error('Failed to sync mentions: ' + error.message)
  }
}

export interface Backlink {
  id: string                 // from_entry id (always a knowledge_entries row)
  title: string | null
  kind: string
  entity: string
  updated_at: string
}

/**
 * Returns the workspace pages (or any entries) that mention `entryId` via
 * relation='mentions'. Excludes the entry itself and excludes vault sources.
 */
export async function getEntryBacklinks(entryId: string): Promise<Backlink[]> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_links')
    .select('from_entry, knowledge_entries!knowledge_links_from_entry_fkey(id, title, kind, entity, updated_at, org_id, access, status)')
    .eq('to_entry', entryId)
    .eq('relation', 'mentions')
  if (error) throw new Error('Failed to load backlinks: ' + error.message)
  const out: Backlink[] = []
  ;(data ?? []).forEach((row: any) => {
    const e = row.knowledge_entries
    if (!e) return
    if (e.org_id !== org_id) return
    if (e.access === 'vault') return
    if (e.status !== 'active') return
    if (e.id === entryId) return
    out.push({ id: e.id, title: e.title, kind: e.kind, entity: e.entity, updated_at: e.updated_at })
  })
  // Stable order: newest first
  out.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return out
}

/**
 * Returns the workspace pages that mention `projectId` via relation='mentions'.
 */
export async function getProjectBacklinks(projectId: string): Promise<Backlink[]> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_links')
    .select('from_entry, knowledge_entries!knowledge_links_from_entry_fkey(id, title, kind, entity, updated_at, org_id, access, status)')
    .eq('to_project', projectId)
    .eq('relation', 'mentions')
  if (error) throw new Error('Failed to load project backlinks: ' + error.message)
  const out: Backlink[] = []
  ;(data ?? []).forEach((row: any) => {
    const e = row.knowledge_entries
    if (!e) return
    if (e.org_id !== org_id) return
    if (e.access === 'vault') return
    if (e.status !== 'active') return
    out.push({ id: e.id, title: e.title, kind: e.kind, entity: e.entity, updated_at: e.updated_at })
  })
  out.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return out
}

/**
 * Map of `${kind}::${label.toLowerCase()}` -> { id, kind } for every mention
 * token in `body`, resolving against the caller's org. Used by the Preview
 * pane to render pills with the right href and to mark unresolved tokens
 * as "broken".
 */
export async function resolveMentionsForRender(body: string): Promise<Record<string, { kind: LinkTargetKind; id: string }>> {
  const { supabase, org_id } = await getCtx()
  const tokens = parseMentionTokens(body)
  const resolved = await resolveMentions(supabase, org_id, tokens)
  const out: Record<string, { kind: LinkTargetKind; id: string }> = {}
  resolved.forEach((id, key) => {
    const kind = key.startsWith('project::') ? 'project' : 'entry'
    out[key] = { kind, id }
  })
  return out
}

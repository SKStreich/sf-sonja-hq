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
import { fetchEntryEntityMap } from '@/lib/entities/multi-entity'

async function getCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

export type LinkTargetKind = 'entry' | 'project' | 'task'

// `searchLinkTargets` only returns entry/project candidates — tasks aren't
// searchable (they're embedded by creation, not by picking from a list).
export type SearchableKind = 'entry' | 'project'

export interface LinkTarget {
  kind: SearchableKind
  id: string
  label: string           // title (entry) or name (project)
  hint?: string | null    // entity tag for disambiguation
}

/**
 * Returns up to 8 entry/project candidates matching `query`, for the editor's
 * `[[…]]` autocomplete popup. Empty `query` returns recent entries + projects.
 * Vault entries and archived rows are excluded. When `kind` is supplied, the
 * other kind's query is skipped entirely — `/embed-entry` and `/embed-project`
 * use this to scope the picker.
 */
export async function searchLinkTargets(
  query: string,
  kind?: SearchableKind,
): Promise<LinkTarget[]> {
  const { supabase, org_id } = await getCtx()
  const q = query.trim()
  const like = `%${q}%`

  const wantEntries = kind !== 'project'
  const wantProjects = kind !== 'entry'

  // Entries: standard-access, non-vault, non-archived, with a non-empty title.
  let entries: any[] = []
  if (wantEntries) {
    let entriesQ = (supabase as any)
      .from('knowledge_entries')
      .select('id, title, kind, updated_at')
      .eq('org_id', org_id)
      .neq('access', 'vault')
      .eq('status', 'active')
      .not('title', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(8)
    if (q) entriesQ = entriesQ.ilike('title', like)
    const { data } = await entriesQ
    entries = data ?? []
  }
  const entryEntityMap = await fetchEntryEntityMap(supabase, entries.map((e: any) => e.id))

  // Projects: org-scoped, not archived (archived is a boolean column, not a status value).
  let projects: any[] = []
  if (wantProjects) {
    let projectsQ = (supabase as any)
      .from('projects')
      .select('id, name, status')
      .eq('org_id', org_id)
      .eq('archived', false)
      .order('updated_at', { ascending: false })
      .limit(8)
    if (q) projectsQ = projectsQ.ilike('name', like)
    const { data } = await projectsQ
    projects = data ?? []
  }

  const results: LinkTarget[] = []
  projects.forEach((p: any) => results.push({
    kind: 'project', id: p.id, label: p.name, hint: null,
  }))
  entries.forEach((e: any) => results.push({
    kind: 'entry', id: e.id, label: e.title,
    hint: `${e.kind} · ${(entryEntityMap[e.id] ?? []).join('+') || '—'}`,
  }))
  // Interleave: projects first (rarer), then entries. Cap at 8 total.
  return results.slice(0, 8)
}

/**
 * Parses [[Entry: Title]], [[Project: Name]] and [[Task: Title|<uuid>]] tokens
 * from raw markdown. For entries/projects, dedup key is `(kind, label)`
 * (case-insensitive). For tasks, dedup key is the explicit UUID — title is
 * ambiguous across tasks, so the ID is required for a token to resolve.
 *
 * Token shapes accepted:
 *   `[[Entry: Some Title]]`
 *   `[[Project: SF Solutions]]`
 *   `[[Task: Email John|11111111-1111-1111-1111-111111111111]]`
 *   `[[Task: Email John]]`               ← parses but won't resolve
 *
 * Not exported: 'use server' files only permit async-function exports.
 */
// UUID-ish: at least one hex/dash chunk after `|`. Loose to keep the regex
// simple; resolveMentions verifies the FK at lookup time.
const MENTION_RE =
  /\[\[(Entry|Project|Task):\s*([^\]\n|]+?)\s*(?:\|\s*([^\]\n\s]+?)\s*)?\]\]/g

export interface ParsedMentionToken {
  kind: LinkTargetKind
  label: string
  explicitId?: string   // present iff the token had `|<id>` (Task tokens only)
}

function parseMentionTokens(body: string): ParsedMentionToken[] {
  const re = new RegExp(MENTION_RE.source, MENTION_RE.flags)
  const seen = new Set<string>()
  const out: ParsedMentionToken[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const rawKind = m[1].toLowerCase()
    const kind: LinkTargetKind =
      rawKind === 'task' ? 'task' : rawKind === 'project' ? 'project' : 'entry'
    const label = m[2].trim()
    if (!label) continue
    const explicitId = m[3]?.trim() || undefined
    // For tasks, dedup by id (label is ambiguous); for entry/project, by label.
    const key =
      kind === 'task'
        ? explicitId
          ? `task::${explicitId.toLowerCase()}`
          : `task::${label.toLowerCase()}::nil`  // unresolved task tokens still deduped
        : `${kind}::${label.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ kind, label, explicitId })
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
  tokens: ParsedMentionToken[],
): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()
  if (tokens.length === 0) return resolved

  const entryLabels = tokens.filter(t => t.kind === 'entry').map(t => t.label)
  const projectLabels = tokens.filter(t => t.kind === 'project').map(t => t.label)
  const taskIds = tokens
    .filter(t => t.kind === 'task' && t.explicitId)
    .map(t => t.explicitId!) as string[]

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

  if (taskIds.length > 0) {
    // Tasks are resolved by id (titles are not unique). Verify each id
    // exists in the caller's org and isn't archived. Map key is `task::<id>`.
    const { data } = await supabase
      .from('tasks')
      .select('id')
      .eq('org_id', org_id)
      .eq('archived', false)
      .in('id', taskIds)
    ;(data ?? []).forEach((row: any) => {
      resolved.set(`task::${(row.id as string).toLowerCase()}`, row.id)
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
    const key =
      tok.kind === 'task' && tok.explicitId
        ? `task::${tok.explicitId.toLowerCase()}`
        : `${tok.kind}::${tok.label.toLowerCase()}`
    const targetId = resolved.get(key)
    if (!targetId) continue
    if (tok.kind === 'entry') {
      if (targetId === fromEntryId) continue  // ignore self-mention
      rows.push({
        from_entry: fromEntryId, to_entry: targetId, to_project: null, to_task: null,
        relation: 'mentions', created_by: user.id,
      })
    } else if (tok.kind === 'project') {
      rows.push({
        from_entry: fromEntryId, to_entry: null, to_project: targetId, to_task: null,
        relation: 'mentions', created_by: user.id,
      })
    } else {
      rows.push({
        from_entry: fromEntryId, to_entry: null, to_project: null, to_task: targetId,
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
    .select('from_entry, knowledge_entries!knowledge_links_from_entry_fkey(id, title, kind, updated_at, org_id, access, status)')
    .eq('to_entry', entryId)
    .eq('relation', 'mentions')
  if (error) throw new Error('Failed to load backlinks: ' + error.message)
  const entries = (data ?? []).map((row: any) => row.knowledge_entries).filter(Boolean)
  const entityMap = await fetchEntryEntityMap(supabase, entries.map((e: any) => e.id))
  const out: Backlink[] = []
  entries.forEach((e: any) => {
    if (e.org_id !== org_id) return
    if (e.access === 'vault') return
    if (e.status !== 'active') return
    if (e.id === entryId) return
    out.push({ id: e.id, title: e.title, kind: e.kind, entity: (entityMap[e.id] ?? [])[0] ?? '—', updated_at: e.updated_at })
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
    .select('from_entry, knowledge_entries!knowledge_links_from_entry_fkey(id, title, kind, updated_at, org_id, access, status)')
    .eq('to_project', projectId)
    .eq('relation', 'mentions')
  if (error) throw new Error('Failed to load project backlinks: ' + error.message)
  const entries = (data ?? []).map((row: any) => row.knowledge_entries).filter(Boolean)
  const entityMap = await fetchEntryEntityMap(supabase, entries.map((e: any) => e.id))
  const out: Backlink[] = []
  entries.forEach((e: any) => {
    if (e.org_id !== org_id) return
    if (e.access === 'vault') return
    if (e.status !== 'active') return
    out.push({ id: e.id, title: e.title, kind: e.kind, entity: (entityMap[e.id] ?? [])[0] ?? '—', updated_at: e.updated_at })
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
    const kind: LinkTargetKind = key.startsWith('project::')
      ? 'project'
      : key.startsWith('task::')
        ? 'task'
        : 'entry'
    out[key] = { kind, id }
  })
  return out
}

// ── Deliberate attachments (relation='attached') ───────────────────────────
//
// Distinct from 'mentions' (incidental [[Project: Name]] references that the
// body scanner writes). An *attachment* is the explicit "pin this doc to this
// project" action taken from a project's Linked tab — the thing that was
// missing during the Loadstar / SF Solutions engagement. Vault docs ARE
// allowed as attach targets (locked decision OQ6); the UI badges them.

export interface AttachTarget {
  id: string
  title: string
  kind: string
  entity: string
  vault: boolean
}

/**
 * Up to 8 attachable knowledge entries for the project's attach picker, newest
 * first. Empty `query` returns recent entries. Unlike `searchLinkTargets`,
 * this INCLUDES vault entries (OQ6) — each is flagged so the UI can badge it.
 */
export async function searchAttachableEntries(query: string): Promise<AttachTarget[]> {
  const { supabase, org_id } = await getCtx()
  const q = query.trim()
  let qb = (supabase as any)
    .from('knowledge_entries')
    .select('id, title, kind, access')
    .eq('org_id', org_id)
    .eq('status', 'active')
    .not('title', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(8)
  if (q) qb = qb.ilike('title', `%${q}%`)
  const { data } = await qb
  const rows = (data ?? []) as any[]
  const entityMap = await fetchEntryEntityMap(supabase, rows.map((e) => e.id))
  return rows.map((e: any) => ({
    id: e.id, title: e.title, kind: e.kind, entity: (entityMap[e.id] ?? [])[0] ?? '—',
    vault: e.access === 'vault',
  }))
}

/**
 * Pins knowledge entry `entryId` to project `projectId` (relation='attached').
 * Both must be in the caller's org. A duplicate attach (partial-unique on
 * from_entry/to_project/relation) is swallowed as a safe no-op.
 */
export async function attachEntryToProject(entryId: string, projectId: string): Promise<void> {
  const { supabase, user, org_id } = await getCtx()

  const { data: entry } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, org_id')
    .eq('id', entryId)
    .maybeSingle()
  if (!entry) throw new Error('Entry not found')
  if (entry.org_id !== org_id) throw new Error('Entry in different org')

  const { data: project } = await (supabase as any)
    .from('projects')
    .select('id, org_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project) throw new Error('Project not found')
  if (project.org_id !== org_id) throw new Error('Project in different org')

  const { error } = await (supabase as any).from('knowledge_links').insert({
    from_entry: entryId, to_entry: null, to_project: projectId, to_task: null,
    relation: 'attached', created_by: user.id,
  })
  // 23505 = unique_violation — already attached. Safe no-op.
  if (error && error.code !== '23505') {
    throw new Error('Failed to attach document: ' + error.message)
  }
}

/**
 * Removes an attachment by its knowledge_links row id. The `relation` guard
 * keeps this from ever deleting a 'mentions' or other link. RLS (kl_delete)
 * enforces that the caller owns the from_entry.
 */
export async function detachEntry(linkId: string): Promise<void> {
  const { supabase } = await getCtx()
  const { error } = await (supabase as any)
    .from('knowledge_links')
    .delete()
    .eq('id', linkId)
    .eq('relation', 'attached')
  if (error) throw new Error('Failed to detach document: ' + error.message)
}

export interface ProjectAttachment {
  linkId: string             // knowledge_links row id (for detach)
  id: string                 // from_entry id (a knowledge_entries row)
  title: string | null
  kind: string
  entity: string
  vault: boolean
  updated_at: string
}

/**
 * Knowledge entries deliberately attached to `projectId`. Org-scoped, active
 * entries only. Vault entries ARE returned (OQ6) and flagged.
 */
export async function getProjectAttachments(projectId: string): Promise<ProjectAttachment[]> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_links')
    .select('id, from_entry, knowledge_entries!knowledge_links_from_entry_fkey(id, title, kind, updated_at, org_id, access, status)')
    .eq('to_project', projectId)
    .eq('relation', 'attached')
  if (error) throw new Error('Failed to load attachments: ' + error.message)
  const rows = (data ?? []) as any[]
  const entityMap = await fetchEntryEntityMap(supabase, rows.map((r) => r.knowledge_entries?.id).filter(Boolean))
  const out: ProjectAttachment[] = []
  rows.forEach((row: any) => {
    const e = row.knowledge_entries
    if (!e) return
    if (e.org_id !== org_id) return
    if (e.status !== 'active') return
    out.push({
      linkId: row.id, id: e.id, title: e.title, kind: e.kind,
      entity: (entityMap[e.id] ?? [])[0] ?? '—', vault: e.access === 'vault', updated_at: e.updated_at,
    })
  })
  out.sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  return out
}

export interface EntryAttachment {
  linkId: string
  projectId: string
  name: string
}

/**
 * The reverse direction: projects that entry `entryId` is attached to, for the
 * "Linked to" block on the doc's own page. Org-scoped, non-archived projects.
 */
export async function getEntryAttachments(entryId: string): Promise<EntryAttachment[]> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_links')
    .select('id, to_project, projects:to_project(id, name, org_id, archived)')
    .eq('from_entry', entryId)
    .eq('relation', 'attached')
    .not('to_project', 'is', null)
  if (error) throw new Error('Failed to load entry attachments: ' + error.message)
  const out: EntryAttachment[] = []
  ;(data ?? []).forEach((row: any) => {
    const p = row.projects
    if (!p) return
    if (p.org_id !== org_id) return
    if (p.archived) return
    out.push({ linkId: row.id, projectId: p.id, name: p.name })
  })
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

// ── DB ↔ doc links (U3c: to_database target) ───────────────────────────────
// Same 'attached' relation as projects, just a different target column. Removal
// reuses detachEntry (it deletes by link id + relation guard, target-agnostic).

/**
 * Pins knowledge entry `entryId` to database `databaseId` (relation='attached').
 * Both must be in the caller's org. Duplicate attach is a safe no-op.
 */
export async function attachEntryToDatabase(entryId: string, databaseId: string): Promise<void> {
  const { supabase, user, org_id } = await getCtx()

  const { data: entry } = await (supabase as any)
    .from('knowledge_entries').select('id, org_id').eq('id', entryId).maybeSingle()
  if (!entry) throw new Error('Entry not found')
  if (entry.org_id !== org_id) throw new Error('Entry in different org')

  const { data: db } = await (supabase as any)
    .from('hq_databases').select('id, org_id').eq('id', databaseId).maybeSingle()
  if (!db) throw new Error('Database not found')
  if (db.org_id !== org_id) throw new Error('Database in different org')

  const { error } = await (supabase as any).from('knowledge_links').insert({
    from_entry: entryId, to_entry: null, to_project: null, to_task: null, to_database: databaseId,
    relation: 'attached', created_by: user.id,
  })
  if (error && error.code !== '23505') {
    throw new Error('Failed to link database: ' + error.message)
  }
}

export interface EntryDatabaseLink {
  linkId: string
  databaseId: string
  title: string
  icon: string | null
}

/** Databases that entry `entryId` is attached to (for the doc's "Linked to" block). */
export async function getEntryDatabaseLinks(entryId: string): Promise<EntryDatabaseLink[]> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_links')
    .select('id, to_database, hq_databases:to_database(id, title, icon, org_id)')
    .eq('from_entry', entryId)
    .eq('relation', 'attached')
    .not('to_database', 'is', null)
  if (error) throw new Error('Failed to load database links: ' + error.message)
  const out: EntryDatabaseLink[] = []
  ;(data ?? []).forEach((row: any) => {
    const d = row.hq_databases
    if (!d || d.org_id !== org_id) return
    out.push({ linkId: row.id, databaseId: d.id, title: d.title, icon: d.icon ?? null })
  })
  out.sort((a, b) => a.title.localeCompare(b.title))
  return out
}

export interface DatabaseEntryLink {
  linkId: string
  entryId: string
  title: string | null
  kind: string
  vault: boolean
}

/** The reverse: entries attached to database `databaseId` (for the DB detail). */
export async function getDatabaseEntryLinks(databaseId: string): Promise<DatabaseEntryLink[]> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_links')
    .select('id, from_entry, knowledge_entries!knowledge_links_from_entry_fkey(id, title, kind, org_id, access, status)')
    .eq('to_database', databaseId)
    .eq('relation', 'attached')
  if (error) throw new Error('Failed to load database backlinks: ' + error.message)
  const out: DatabaseEntryLink[] = []
  ;(data ?? []).forEach((row: any) => {
    const e = row.knowledge_entries
    if (!e || e.org_id !== org_id || e.status !== 'active') return
    out.push({ linkId: row.id, entryId: e.id, title: e.title, kind: e.kind, vault: e.access === 'vault' })
  })
  out.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
  return out
}

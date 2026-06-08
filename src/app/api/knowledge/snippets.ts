'use server'
/**
 * Server actions for the "Save code snippet" flow.
 *
 * A snippet is a regular workspace entry (kind='workspace') with:
 *   - body = Markdown fenced code + optional source line + [[Project: …]] mention
 *   - tags = ['code-snippet', <language>]  — filterable
 *   - source = 'manual'  (CHECK-constrained on knowledge_entries.source)
 *   - source_ref = optional GitHub commit URL
 *
 * No new DB schema. The existing PR-#10 mention syncer turns the
 * `[[Project: Name]]` reference into a real two-way link automatically.
 */
import { createClient } from '@/lib/supabase/server'
import { createWorkspacePage } from './workspace'
import { snippetBody, defaultSnippetTitle } from '@/lib/knowledge/snippet-body'
import { fetchGitHubCommits } from '@/app/api/integrations/actions'
import { sortEntitySlugs } from '@/lib/entities/multi-entity'
import type { Entity } from './actions'

/** Resolve a project's primary entity slug from the project_entities junction
 *  embed (`project_entities(entities(type))`). Canonical-order first, or fallback. */
function primaryProjectEntity(projectEntities: any): Entity {
  const slugs = sortEntitySlugs(
    ((projectEntities ?? []) as any[]).map((pe) => pe?.entities?.type).filter(Boolean),
  )
  return (slugs[0] ?? 'personal') as Entity
}

export interface ProjectChoice {
  id: string
  name: string
  entity: Entity
  github_url: string | null
}

/**
 * Lightweight projects list for the snippet modal's project picker.
 * Returns only fields the modal needs (id, name, entity, github_url).
 */
export async function listProjectsForSnippet(): Promise<ProjectChoice[]> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')

  const { data, error } = await (supabase as any)
    .from('projects')
    .select('id, name, github_url, project_entities(entities(type))')
    .eq('org_id', profile.org_id)
    .order('name', { ascending: true })
  if (error) throw new Error('Failed to list projects: ' + error.message)
  return (data ?? []).map((p: any) => ({
    id: p.id,
    name: p.name,
    github_url: p.github_url,
    entity: primaryProjectEntity(p.project_entities),
  })) as ProjectChoice[]
}

/**
 * Fetch recent commits for a project that has a github_url. Empty array if
 * the project has no URL, the URL doesn't parse, or GitHub returns an error.
 * Delegates to the existing integrations helper so we don't have a second
 * GitHub client in the codebase.
 */
export async function listCommitsForProject(projectId: string, limit = 15): Promise<Array<{
  sha: string; message: string; author: string; date: string; url: string
}>> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')

  const { data: project } = await (supabase as any)
    .from('projects')
    .select('id, name, github_url, org_id')
    .eq('id', projectId)
    .maybeSingle()
  if (!project || project.org_id !== profile.org_id) return []
  if (!project.github_url) return []
  return await fetchGitHubCommits(project.github_url, limit)
}

export interface SaveCodeSnippetInput {
  title?: string
  language: string
  code: string
  /** Project to associate (also drives [[Project: …]] mention). */
  projectId?: string | null
  /** Pre-resolved GitHub commit URL (from the commit picker dropdown). */
  sourceUrl?: string | null
  /** Optional commit message / link label for the Source line. */
  sourceLabel?: string | null
  entity?: Entity
  parentId?: string | null
}

export async function saveCodeSnippet(input: SaveCodeSnippetInput): Promise<{ id: string }> {
  const code = (input.code ?? '').trim()
  if (code.length === 0) throw new Error('Cannot save an empty snippet')
  const language = (input.language ?? '').trim().toLowerCase()

  let projectName: string | null = null
  let entity: Entity | undefined = input.entity

  if (input.projectId) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Not authenticated')
    const { data: profile } = await (supabase as any)
      .from('user_profiles').select('org_id').eq('id', user.id).single()
    if (!profile) throw new Error('No profile')

    const { data: project } = await (supabase as any)
      .from('projects')
      .select('id, name, org_id, project_entities(entities(type))')
      .eq('id', input.projectId)
      .maybeSingle()
    if (!project) throw new Error('Project not found')
    if (project.org_id !== profile.org_id) throw new Error('Project in different org')
    projectName = project.name as string
    if (!entity) entity = primaryProjectEntity(project.project_entities)
  }

  const body = snippetBody({
    language,
    code,
    sourceUrl: input.sourceUrl ?? null,
    sourceLabel: input.sourceLabel ?? null,
    projectName,
  })

  const title = (input.title ?? '').trim() || defaultSnippetTitle(code)
  const tags = ['code-snippet']
  if (language) tags.push(language)

  return createWorkspacePage({
    title,
    entity,
    parentId: input.parentId ?? null,
    body,
    source: 'manual',
    sourceRef: input.sourceUrl ?? null,
    tags,
  })
}

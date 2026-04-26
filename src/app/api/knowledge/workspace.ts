'use server'
/**
 * Workspace pages — Notion-style hierarchical Markdown surfaces inside the
 * knowledge_entries table (kind='workspace', linked via parent_id).
 *
 * Slice 1 (Sprint 10c): create / update / delete / list-tree. Slash commands,
 * backlinks, embeds layer in later slices.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { Entity } from './actions'

export interface WorkspaceNode {
  id: string
  parent_id: string | null
  title: string | null
  entity: Entity
  updated_at: string
  has_children: boolean
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
 * Returns the full workspace tree for the org as a flat list. Caller builds
 * the hierarchy client-side. Excludes vault entries (workspace pages are
 * always 'standard' access).
 */
/**
 * Walks up parent_id chain from `id` and returns ancestors root-first, NOT
 * including the entry itself. Stops at the first non-workspace ancestor or
 * after 20 hops to avoid pathological cycles.
 */
export async function getWorkspaceAncestors(id: string): Promise<Array<{ id: string; title: string | null }>> {
  const { supabase, org_id } = await getCtx()
  const out: Array<{ id: string; title: string | null }> = []
  let cursor: string | null = id
  const seen = new Set<string>()
  for (let i = 0; i < 20 && cursor; i++) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    const { data }: { data: { id: string; title: string | null; parent_id: string | null; kind: string; org_id: string } | null } =
      await (supabase as any)
        .from('knowledge_entries')
        .select('id, title, parent_id, kind, org_id')
        .eq('id', cursor).maybeSingle()
    if (!data || data.org_id !== org_id || data.kind !== 'workspace') break
    if (i > 0) out.unshift({ id: data.id, title: data.title })  // skip self
    cursor = data.parent_id ?? null
  }
  return out
}

/**
 * Returns the immediate parent (if any) plus all sibling pages of `id`,
 * for rendering an in-context navigation strip. Excludes `id` itself.
 */
export async function getWorkspaceSiblings(id: string): Promise<{
  parent: { id: string; title: string | null } | null
  siblings: WorkspaceNode[]
}> {
  const { supabase, org_id } = await getCtx()
  const { data: self } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, parent_id, kind, org_id')
    .eq('id', id)
    .maybeSingle()
  if (!self || self.org_id !== org_id || self.kind !== 'workspace') {
    return { parent: null, siblings: [] }
  }

  let parent: { id: string; title: string | null } | null = null
  if (self.parent_id) {
    const { data: p } = await (supabase as any)
      .from('knowledge_entries')
      .select('id, title')
      .eq('id', self.parent_id)
      .maybeSingle()
    if (p) parent = { id: p.id, title: p.title }
  }

  let q = (supabase as any)
    .from('knowledge_entries')
    .select('id, parent_id, title, entity, updated_at')
    .eq('org_id', org_id)
    .eq('kind', 'workspace')
    .eq('status', 'active')
    .neq('id', id)
    .order('updated_at', { ascending: false })
  q = self.parent_id ? q.eq('parent_id', self.parent_id) : q.is('parent_id', null)
  const { data } = await q
  return {
    parent,
    siblings: (data ?? []).map((r: any) => ({ ...r, has_children: false })),
  }
}

export async function listWorkspaceChildren(parentId: string): Promise<WorkspaceNode[]> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, parent_id, title, entity, updated_at')
    .eq('org_id', org_id)
    .eq('kind', 'workspace')
    .eq('status', 'active')
    .eq('parent_id', parentId)
    .order('updated_at', { ascending: false })
  if (error) throw new Error('Failed to list children: ' + error.message)
  // Defensive: check which children themselves have grandchildren so we can
  // show the "has children" affordance.
  const ids = (data ?? []).map((r: any) => r.id)
  let withGrandkids = new Set<string>()
  if (ids.length) {
    const { data: g } = await (supabase as any)
      .from('knowledge_entries')
      .select('parent_id')
      .in('parent_id', ids)
      .eq('kind', 'workspace')
      .eq('status', 'active')
    withGrandkids = new Set((g ?? []).map((r: any) => r.parent_id))
  }
  return (data ?? []).map((r: any) => ({ ...r, has_children: withGrandkids.has(r.id) }))
}

export async function listWorkspaceTree(): Promise<WorkspaceNode[]> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, parent_id, title, entity, updated_at')
    .eq('org_id', org_id)
    .eq('kind', 'workspace')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
  if (error) throw new Error('Failed to list workspace pages: ' + error.message)
  const rows = (data ?? []) as Array<Omit<WorkspaceNode, 'has_children'>>
  const childIds = new Set(rows.map(r => r.parent_id).filter(Boolean))
  return rows.map(r => ({ ...r, has_children: childIds.has(r.id) }))
}

export async function createWorkspacePage(input: {
  parentId?: string | null
  title?: string
  entity?: Entity
}): Promise<{ id: string }> {
  const { supabase, user, org_id } = await getCtx()

  // Inherit entity from parent if not provided.
  let entity: Entity = input.entity ?? 'personal'
  if (input.parentId) {
    const { data: parent } = await (supabase as any)
      .from('knowledge_entries')
      .select('entity, kind, org_id')
      .eq('id', input.parentId)
      .maybeSingle()
    if (!parent) throw new Error('Parent page not found')
    if (parent.org_id !== org_id) throw new Error('Parent in different org')
    if (parent.kind !== 'workspace') throw new Error('Parent must be a workspace page')
    if (!input.entity) entity = parent.entity as Entity
  }

  const { data, error } = await (supabase as any)
    .from('knowledge_entries')
    .insert({
      org_id, user_id: user.id,
      kind: 'workspace', access: 'standard',
      entity,
      parent_id: input.parentId ?? null,
      title: input.title?.trim() || 'Untitled page',
      body: '',
      source: 'manual',
      tags: [],
    })
    .select('id')
    .single()
  if (error) throw new Error('Failed to create page: ' + error.message)

  revalidatePath('/dashboard/knowledge')
  return { id: data.id as string }
}

export async function updateWorkspacePage(
  id: string,
  patch: { title?: string; body?: string; entity?: Entity },
): Promise<void> {
  const { supabase, org_id } = await getCtx()

  const { data: entry } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, kind, org_id')
    .eq('id', id)
    .maybeSingle()
  if (!entry) throw new Error('Page not found')
  if (entry.org_id !== org_id) throw new Error('Page in different org')
  if (entry.kind !== 'workspace') throw new Error('Not a workspace page')

  const update: any = {}
  if (patch.title !== undefined) update.title = patch.title.trim() || 'Untitled page'
  if (patch.body !== undefined) update.body = patch.body
  if (patch.entity !== undefined) update.entity = patch.entity

  const { error } = await (supabase as any)
    .from('knowledge_entries').update(update).eq('id', id)
  if (error) throw new Error('Failed to update page: ' + error.message)

  revalidatePath('/dashboard/knowledge')
  revalidatePath(`/dashboard/knowledge/${id}`)
}

/**
 * Soft-delete (status='archived'). Re-parents direct children to the
 * deleted page's parent so the tree doesn't orphan them.
 */
export async function deleteWorkspacePage(id: string): Promise<void> {
  const { supabase, org_id } = await getCtx()

  const { data: entry } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, kind, org_id, parent_id')
    .eq('id', id)
    .maybeSingle()
  if (!entry) throw new Error('Page not found')
  if (entry.org_id !== org_id) throw new Error('Page in different org')
  if (entry.kind !== 'workspace') throw new Error('Not a workspace page')

  await (supabase as any)
    .from('knowledge_entries')
    .update({ parent_id: entry.parent_id ?? null })
    .eq('parent_id', id)

  const { error } = await (supabase as any)
    .from('knowledge_entries')
    .update({ status: 'archived' })
    .eq('id', id)
  if (error) throw new Error('Failed to delete page: ' + error.message)

  revalidatePath('/dashboard/knowledge')
}

/**
 * Move a page to a new parent (or to root if parentId is null). Prevents
 * cycles by walking up the new-parent's ancestors.
 */
export async function moveWorkspacePage(id: string, newParentId: string | null): Promise<void> {
  const { supabase, org_id } = await getCtx()
  if (id === newParentId) throw new Error('Cannot make a page its own parent')

  if (newParentId) {
    let cursor: string | null = newParentId
    const seen = new Set<string>()
    while (cursor) {
      if (cursor === id) throw new Error('Move would create a cycle')
      if (seen.has(cursor)) break
      seen.add(cursor)
      const { data }: { data: { parent_id: string | null } | null } = await (supabase as any)
        .from('knowledge_entries').select('parent_id').eq('id', cursor).maybeSingle()
      cursor = data?.parent_id ?? null
    }
  }

  const { error } = await (supabase as any)
    .from('knowledge_entries')
    .update({ parent_id: newParentId })
    .eq('id', id)
    .eq('org_id', org_id)
    .eq('kind', 'workspace')
  if (error) throw new Error('Failed to move page: ' + error.message)

  revalidatePath('/dashboard/knowledge')
}

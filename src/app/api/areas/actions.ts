'use server'
/**
 * Areas catalogue — server actions (Sprint 13 A1).
 *
 * CRUD over the `areas` table for the Settings → Areas manage UI. Item-assignment
 * (the junctions) lands in A2/A3; this file only manages the catalogue itself.
 * All writes go through the caller's RLS-scoped client (areas_all = org-scoped),
 * so a row can only ever touch the caller's org.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { ENTITY_SLUGS, type EntitySlug } from '@/lib/entities/config'
import { slugifyArea, nextAreaSortOrder, type Area } from '@/lib/areas/areas'

async function getCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

const isEntity = (e: string): e is EntitySlug => (ENTITY_SLUGS as readonly string[]).includes(e)

export async function listAreas(): Promise<Area[]> {
  const { supabase } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('areas')
    .select('id, entity, name, slug, sort_order')
    .order('entity').order('sort_order')
  if (error) throw new Error('Failed to list areas: ' + error.message)
  return (data ?? []) as Area[]
}

export async function createArea(entity: string, name: string): Promise<Area> {
  const { supabase, user, org_id } = await getCtx()
  if (!isEntity(entity)) throw new Error('Invalid entity')
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Area name is required')
  const slug = slugifyArea(trimmed)
  if (!slug) throw new Error('Area name must contain letters or numbers')

  // sort_order = end of this entity's list.
  const existing = await listAreas()
  const sort_order = nextAreaSortOrder(existing.filter(a => a.entity === entity))

  const { data, error } = await (supabase as any)
    .from('areas')
    .insert({ org_id, entity, name: trimmed, slug, sort_order, created_by: user.id })
    .select('id, entity, name, slug, sort_order')
    .single()
  if (error) {
    if (error.code === '23505') throw new Error(`An area "${trimmed}" already exists for this entity`)
    throw new Error('Failed to create area: ' + error.message)
  }
  revalidatePath('/dashboard/settings')
  return data as Area
}

/** Rename keeps the stable `slug` (deep-links / identity) — only the display
 *  name changes. */
export async function renameArea(id: string, name: string): Promise<void> {
  const { supabase } = await getCtx()
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Area name is required')
  const { data, error } = await (supabase as any)
    .from('areas')
    .update({ name: trimmed, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) throw new Error('Failed to rename area: ' + error.message)
  if (!data || data.length === 0) throw new Error('Area not found (or not yours to edit)')
  revalidatePath('/dashboard/settings')
}

/** Persist a new order for one entity's areas (sort_order = position). */
export async function reorderAreas(entity: string, orderedIds: string[]): Promise<void> {
  const { supabase } = await getCtx()
  if (!isEntity(entity)) throw new Error('Invalid entity')
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await (supabase as any)
      .from('areas')
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq('id', orderedIds[i])
      .eq('entity', entity)
    if (error) throw new Error('Failed to reorder areas: ' + error.message)
  }
  revalidatePath('/dashboard/settings')
}

export async function deleteArea(id: string): Promise<void> {
  const { supabase } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('areas').delete().eq('id', id).select('id')
  if (error) throw new Error('Failed to delete area: ' + error.message)
  if (!data || data.length === 0) throw new Error('Area not found (or not yours to delete)')
  revalidatePath('/dashboard/settings')
}

/** How many items (across all three junctions) are filed under an area — drives
 *  the "N items will lose this area" delete confirmation. */
export async function countAreaUsage(id: string): Promise<number> {
  const { supabase } = await getCtx()
  const tables = ['knowledge_entry_areas', 'project_areas', 'task_areas']
  let total = 0
  for (const t of tables) {
    const { count } = await (supabase as any)
      .from(t).select('area_id', { count: 'exact', head: true }).eq('area_id', id)
    total += count ?? 0
  }
  return total
}

'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ProjectStatus, ProjectPriority } from '@/types/supabase'
import { setProjectEntities } from '@/lib/entities/multi-entity'

interface ProjectPayload {
  /** Legacy single-entity input (back-compat). Prefer `entity_ids`. */
  entity_id: string
  /** Multi-entity set (entities.id UUIDs). ≥1 required. */
  entity_ids?: string[]
  name: string
  description?: string | null
  status?: ProjectStatus
  priority?: ProjectPriority
  phase?: string | null
  next_action?: string | null
  next_action_type?: string | null
  next_action_due?: string | null
  due_date?: string | null
  start_date?: string | null
}

async function getContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any).from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }
  if (!profile) throw new Error('No profile found')
  return { supabase, user, org_id: profile.org_id }
}

export async function createProject(payload: ProjectPayload): Promise<{ id: string }> {
  const { supabase, user, org_id } = await getContext()
  // Combine single + set inputs; primary feeds the legacy column.
  const entityIds = payload.entity_ids ?? (payload.entity_id ? [payload.entity_id] : [])
  if (entityIds.length === 0) throw new Error('At least one entity is required')
  const primary = entityIds[0]
  const { data, error } = await supabase.from('projects').insert({
    org_id,
    created_by: user.id,
    entity_id: primary,
    name: payload.name,
    description: payload.description ?? null,
    status: payload.status ?? 'planning',
    priority: payload.priority ?? 'medium',
    phase: payload.phase ?? null,
    next_action: payload.next_action ?? null,
    next_action_type: payload.next_action_type ?? null,
    next_action_due: payload.next_action_due ?? null,
    due_date: payload.due_date ?? null,
  } as any).select('id').single()
  if (error) throw new Error('Failed to create project')
  await setProjectEntities(supabase, (data as any).id, org_id, entityIds)
  revalidatePath('/dashboard/projects')
  return { id: (data as any).id }
}

export async function updateProject(id: string, payload: Partial<ProjectPayload> & { status?: ProjectStatus }) {
  const { supabase, org_id } = await getContext()
  // Strip entity_ids (not a column); the primary feeds the legacy entity_id col.
  const { entity_ids, ...rest } = payload
  const update: Record<string, any> = { ...rest }
  if (entity_ids !== undefined) {
    if (entity_ids.length === 0) throw new Error('At least one entity is required')
    update.entity_id = entity_ids[0]
  }
  const { error } = await (supabase as any).from('projects').update(update).eq('id', id)
  if (error) throw new Error('Failed to update project')
  if (entity_ids !== undefined) await setProjectEntities(supabase, id, org_id, entity_ids)
  revalidatePath('/dashboard/projects')
  revalidatePath(`/dashboard/projects/${id}`)
}

export async function archiveProject(id: string) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('projects').update({ archived: true }).eq('id', id)
  if (error) throw new Error('Failed to archive project')
  revalidatePath('/dashboard/projects')
}

// Project updates / log
export async function addProjectUpdate(projectId: string, content: string, updateType: string) {
  const { supabase, user, org_id } = await getContext()
  const { error } = await (supabase as any).from('project_updates').insert({
    project_id: projectId,
    org_id,
    user_id: user.id,
    content: content.trim(),
    update_type: updateType,
  })
  if (error) throw new Error('Failed to add update')
  revalidatePath(`/dashboard/projects/${projectId}`)
}

export async function deleteProjectUpdate(updateId: string, projectId: string) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('project_updates').delete().eq('id', updateId)
  if (error) throw new Error('Failed to delete update')
  revalidatePath(`/dashboard/projects/${projectId}`)
}

// File metadata (actual upload handled client-side via Supabase Storage)
export async function saveProjectFile(projectId: string, payload: {
  filename: string
  storage_path: string
  file_size: number
  content_type: string
}) {
  const { supabase, user, org_id } = await getContext()
  const { data, error } = await (supabase as any).from('project_files').insert({
    project_id: projectId,
    org_id,
    user_id: user.id,
    ...payload,
  }).select('*').single()
  if (error) throw new Error('Failed to save file record')
  revalidatePath(`/dashboard/projects/${projectId}`)
  return data
}

export async function deleteProjectFile(fileId: string, storagePath: string, projectId: string) {
  const { supabase } = await getContext()
  await supabase.storage.from('project-files').remove([storagePath])
  const { error } = await (supabase as any).from('project_files').delete().eq('id', fileId)
  if (error) throw new Error('Failed to delete file')
  revalidatePath(`/dashboard/projects/${projectId}`)
}

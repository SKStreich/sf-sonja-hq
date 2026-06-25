'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ProjectStatus, ProjectPriority } from '@/types/supabase'
import { setProjectEntities } from '@/lib/entities/multi-entity'
import { setProjectAreas } from '@/lib/areas/junctions'
import { refreshNextAction } from '@/lib/projects/next-action'

interface ProjectPayload {
  /** Legacy single-entity input (back-compat). Prefer `entity_ids`. */
  entity_id: string
  /** Multi-entity set (entities.id UUIDs). ≥1 required. */
  entity_ids?: string[]
  /** Area ids (Sprint 13 A3). Optional; reconciled into project_areas. */
  area_ids?: string[]
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
  // Combine single + set inputs. Entities live solely in the project_entities junction.
  const entityIds = payload.entity_ids ?? (payload.entity_id ? [payload.entity_id] : [])
  if (entityIds.length === 0) throw new Error('At least one entity is required')
  const { data, error } = await supabase.from('projects').insert({
    org_id,
    created_by: user.id,
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
  const projectId = (data as any).id
  await setProjectEntities(supabase, projectId, org_id, entityIds)
  if (payload.area_ids && payload.area_ids.length > 0) {
    await setProjectAreas(supabase, projectId, org_id, payload.area_ids)
  }

  // The "next action" entered on the create form becomes a real, completable
  // task — pinned first in the project's task list. refreshNextAction then
  // syncs the cached next_action* columns from it.
  const nextActionText = (payload.next_action ?? '').trim()
  if (nextActionText) {
    const { data: created } = await (supabase as any).from('tasks').insert({
      org_id,
      user_id: user.id,
      created_by: user.id,
      entity_id: entityIds[0],
      project_id: projectId,
      title: nextActionText,
      action_type: payload.next_action_type ?? null,
      due_date: payload.next_action_due ?? null,
      status: 'todo',
      priority: 'medium',
      gtd_bucket: 'backlog',
      archived: false,
    }).select('id').single()
    if (created?.id) {
      await (supabase as any).from('projects').update({ next_task_id: created.id }).eq('id', projectId)
    }
    await refreshNextAction(supabase, projectId)
  }

  revalidatePath('/dashboard/projects')
  return { id: projectId }
}

export async function updateProject(id: string, payload: Partial<ProjectPayload> & { status?: ProjectStatus }) {
  const { supabase, user, org_id } = await getContext()
  // Strip entity_ids + area_ids + legacy entity_id (not columns); those live in
  // their junctions.
  const { entity_ids, area_ids, entity_id: _legacyEntityId, ...rest } = payload
  const update: Record<string, any> = { ...rest }
  if (entity_ids !== undefined && entity_ids.length === 0) {
    throw new Error('At least one entity is required')
  }
  const { error } = await (supabase as any).from('projects').update(update).eq('id', id)
  if (error) throw new Error('Failed to update project')
  if (entity_ids !== undefined) await setProjectEntities(supabase, id, org_id, entity_ids)
  if (area_ids !== undefined) await setProjectAreas(supabase, id, org_id, area_ids)

  // Keep the "next action" headline and its backing task in sync. Editing the
  // next-action fields on the project form updates the pinned task (or creates
  // one if none exists yet); refreshNextAction then re-syncs the cached columns.
  if (payload.next_action !== undefined) {
    const text = (payload.next_action ?? '').trim()
    if (text) {
      const { data: proj } = await (supabase as any).from('projects')
        .select('next_task_id').eq('id', id).single()
      let pinnedId: string | null = proj?.next_task_id ?? null
      if (pinnedId) {
        const { data: t } = await (supabase as any).from('tasks')
          .select('status,archived').eq('id', pinnedId).single()
        if (!t || t.archived || t.status === 'done' || t.status === 'cancelled') pinnedId = null
      }
      const patch = {
        title: text,
        action_type: payload.next_action_type ?? null,
        due_date: payload.next_action_due ?? null,
      }
      if (pinnedId) {
        await (supabase as any).from('tasks').update(patch).eq('id', pinnedId)
      } else {
        const { data: pe } = await (supabase as any).from('project_entities')
          .select('entity_id').eq('project_id', id).limit(1).single()
        if (pe?.entity_id) {
          const { data: created } = await (supabase as any).from('tasks').insert({
            org_id,
            user_id: user.id,
            created_by: user.id,
            entity_id: pe.entity_id,
            project_id: id,
            status: 'todo',
            priority: 'medium',
            gtd_bucket: 'backlog',
            archived: false,
            ...patch,
          }).select('id').single()
          if (created?.id) {
            await (supabase as any).from('projects').update({ next_task_id: created.id }).eq('id', id)
          }
        }
      }
    }
    await refreshNextAction(supabase, id)
  }

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

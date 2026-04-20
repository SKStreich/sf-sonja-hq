'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TaskStatus, ProjectPriority } from '@/types/supabase'

async function getContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any).from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }
  if (!profile) throw new Error('No profile found')
  return { supabase, user, org_id: profile.org_id }
}

export async function createTask(payload: {
  project_id: string
  entity_id: string
  title: string
  description?: string | null
  status?: TaskStatus
  priority?: ProjectPriority
  due_date?: string | null
}) {
  const { supabase, user, org_id } = await getContext()
  const { error } = await (supabase as any).from('tasks').insert({
    org_id,
    user_id: user.id,
    created_by: user.id,
    entity_id: payload.entity_id,
    project_id: payload.project_id,
    title: payload.title,
    description: payload.description ?? null,
    status: payload.status ?? 'todo',
    priority: payload.priority ?? 'medium',
    due_date: payload.due_date ?? null,
    gtd_bucket: 'backlog',
    archived: false,
  })
  if (error) throw new Error('Failed to create task: ' + error.message)
  revalidatePath(`/dashboard/projects/${payload.project_id}`)
  revalidatePath('/dashboard/tasks')
}

export async function reassignTaskProject(taskId: string, newProjectId: string | null, oldProjectId?: string | null) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('tasks').update({ project_id: newProjectId }).eq('id', taskId)
  if (error) throw new Error('Failed to reassign task')
  if (oldProjectId) revalidatePath(`/dashboard/projects/${oldProjectId}`)
  if (newProjectId) revalidatePath(`/dashboard/projects/${newProjectId}`)
  revalidatePath('/dashboard/tasks')
}

export async function updateTask(id: string, projectId: string, updates: {
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: ProjectPriority
  due_date?: string | null
  gtd_bucket?: string
}) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('tasks').update(updates).eq('id', id)
  if (error) throw new Error('Failed to update task')
  revalidatePath(`/dashboard/projects/${projectId}`)
  revalidatePath('/dashboard/tasks')
}

export async function deleteTask(id: string, projectId: string) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('tasks').delete().eq('id', id)
  if (error) throw new Error('Failed to delete task')
  revalidatePath(`/dashboard/projects/${projectId}`)
  revalidatePath('/dashboard/tasks')
}

export type GtdBucket = 'today' | 'this_week' | 'backlog' | 'someday'

export async function moveTaskBucket(id: string, bucket: GtdBucket) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('tasks').update({ gtd_bucket: bucket }).eq('id', id)
  if (error) throw new Error('Failed to move task')
  revalidatePath('/dashboard/tasks')
}

export async function completeTask(id: string) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('tasks').update({ status: 'done' }).eq('id', id)
  if (error) throw new Error('Failed to complete task')
  revalidatePath('/dashboard/tasks')
}

export async function uncompleteTask(id: string) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('tasks').update({ status: 'todo' }).eq('id', id)
  if (error) throw new Error('Failed to uncomplete task')
  revalidatePath('/dashboard/tasks')
}

export async function createManagerTask(payload: {
  title: string
  gtd_bucket: GtdBucket
  entity_id: string
  project_id?: string | null
  priority?: ProjectPriority
  due_date?: string | null
}) {
  const { supabase, user, org_id } = await getContext()
  const { error } = await (supabase as any).from('tasks').insert({
    org_id,
    user_id: user.id,
    created_by: user.id,
    entity_id: payload.entity_id,
    project_id: payload.project_id ?? null,
    title: payload.title,
    status: 'todo',
    priority: payload.priority ?? 'medium',
    due_date: payload.due_date ?? null,
    gtd_bucket: payload.gtd_bucket,
  })
  if (error) throw new Error('Failed to create task: ' + error.message)
  revalidatePath('/dashboard/tasks')
}

export async function cancelTask(id: string) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('tasks').update({ status: 'cancelled' }).eq('id', id)
  if (error) throw new Error('Failed to cancel task')
  revalidatePath('/dashboard/tasks')
}

export async function reopenTask(id: string) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('tasks').update({ status: 'todo' }).eq('id', id)
  if (error) throw new Error('Failed to reopen task')
  revalidatePath('/dashboard/tasks')
}

export async function addTaskNote(taskId: string, content: string) {
  const { supabase, user, org_id } = await getContext()
  const { error } = await (supabase as any).from('task_notes').insert({
    task_id: taskId,
    org_id,
    content,
    created_by: user.id,
  })
  if (error) throw new Error('Failed to add note')
  revalidatePath('/dashboard/tasks')
}

export async function deleteTaskNote(noteId: string) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('task_notes').delete().eq('id', noteId)
  if (error) throw new Error('Failed to delete note')
  revalidatePath('/dashboard/tasks')
}

export async function saveTaskFile(taskId: string, payload: {
  filename: string
  storage_path: string
  file_size: number
  content_type: string
}) {
  const { supabase, user, org_id } = await getContext()
  const { error } = await (supabase as any).from('task_files').insert({
    task_id: taskId,
    org_id,
    created_by: user.id,
    ...payload,
  })
  if (error) throw new Error('Failed to save file record')
  revalidatePath('/dashboard/tasks')
}

export async function deleteTaskFile(fileId: string, storagePath: string) {
  const { supabase } = await getContext()
  await supabase.storage.from('project-files').remove([storagePath])
  const { error } = await (supabase as any).from('task_files').delete().eq('id', fileId)
  if (error) throw new Error('Failed to delete file')
  revalidatePath('/dashboard/tasks')
}

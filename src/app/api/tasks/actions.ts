'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { TaskStatus, ProjectPriority } from '@/types/supabase'

async function getContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
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
  const { error } = await supabase.from('tasks').insert({
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
  })
  if (error) throw new Error('Failed to create task: ' + error.message)
  revalidatePath(`/dashboard/projects/${payload.project_id}`)
}

export async function updateTask(id: string, projectId: string, updates: {
  title?: string
  description?: string | null
  status?: TaskStatus
  priority?: ProjectPriority
  due_date?: string | null
}) {
  const { supabase } = await getContext()
  const { error } = await supabase.from('tasks').update(updates).eq('id', id)
  if (error) throw new Error('Failed to update task')
  revalidatePath(`/dashboard/projects/${projectId}`)
}

export async function deleteTask(id: string, projectId: string) {
  const { supabase } = await getContext()
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw new Error('Failed to delete task')
  revalidatePath(`/dashboard/projects/${projectId}`)
}

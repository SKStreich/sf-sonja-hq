'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ProjectStatus, ProjectPriority } from '@/types/supabase'

interface ProjectPayload {
  entity_id: string
  name: string
  description?: string | null
  status?: ProjectStatus
  priority?: ProjectPriority
  phase?: string | null
  next_action?: string | null
  due_date?: string | null
  start_date?: string | null
}

async function getContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile found')
  return { supabase, user, org_id: profile.org_id }
}

export async function createProject(payload: ProjectPayload) {
  const { supabase, user, org_id } = await getContext()
  const { error } = await supabase.from('projects').insert({
    org_id,
    created_by: user.id,
    entity_id: payload.entity_id,
    name: payload.name,
    description: payload.description ?? null,
    status: payload.status ?? 'planning',
    priority: payload.priority ?? 'medium',
    phase: payload.phase ?? null,
    next_action: payload.next_action ?? null,
    due_date: payload.due_date ?? null,
  })
  if (error) throw new Error('Failed to create project')
  revalidatePath('/dashboard/projects')
}

export async function updateProject(id: string, payload: Partial<ProjectPayload> & { status?: ProjectStatus }) {
  const { supabase } = await getContext()
  const { error } = await supabase.from('projects').update(payload).eq('id', id)
  if (error) throw new Error('Failed to update project')
  revalidatePath('/dashboard/projects')
  revalidatePath(`/dashboard/projects/${id}`)
}

export async function archiveProject(id: string) {
  const { supabase } = await getContext()
  const { error } = await supabase.from('projects').update({ archived: true } as any).eq('id', id)
  if (error) throw new Error('Failed to archive project')
  revalidatePath('/dashboard/projects')
}

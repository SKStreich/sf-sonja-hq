import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TaskManager } from '@/components/tasks/TaskManager'

export default async function TaskManagerPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await (supabase as any).from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }

  const [tasksRes, projectsRes, entitiesRes, membersRes] = await Promise.all([
    (supabase as any)
      .from('tasks')
      .select('*, projects(id, name, entity_id), entities(id, name, type, color)')
      .eq('archived', false)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('projects')
      .select('id, name, entity_id, status')
      .neq('status', 'complete')
      .order('name'),
    supabase
      .from('entities')
      .select('*')
      .eq('active', true)
      .order('name'),
    profile?.org_id
      ? (supabase as any)
          .from('user_profiles')
          .select('id, full_name, email')
          .eq('org_id', profile.org_id)
          .order('full_name')
      : Promise.resolve({ data: [] }),
  ])

  return (
    <TaskManager
      tasks={tasksRes.data ?? []}
      projects={projectsRes.data ?? []}
      entities={entitiesRes.data ?? []}
      members={membersRes.data ?? []}
      currentUserId={user.id}
    />
  )
}

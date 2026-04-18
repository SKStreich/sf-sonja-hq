import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { TaskManager } from '@/components/tasks/TaskManager'

export default async function TaskManagerPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [tasksRes, projectsRes, entitiesRes] = await Promise.all([
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
  ])

  return (
    <TaskManager
      tasks={tasksRes.data ?? []}
      projects={projectsRes.data ?? []}
      entities={entitiesRes.data ?? []}
    />
  )
}

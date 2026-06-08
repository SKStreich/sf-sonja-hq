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
      .select('*, projects(id, name, project_entities(entity_id)), entities(id, name, type, color)')
      .eq('archived', false)
      .order('due_date', { ascending: true, nullsFirst: false }),
    supabase
      .from('projects')
      .select('id, name, status, project_entities(entity_id)')
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

  // Collapse the project_entities junction to a single primary entity_id so the
  // (single-entity) task UI keeps deriving a default task entity from its project.
  const primaryEntityId = (p: any): string | null => p?.project_entities?.[0]?.entity_id ?? null
  const projects = (projectsRes.data ?? []).map((p: any) => ({ ...p, entity_id: primaryEntityId(p) }))
  const tasks = (tasksRes.data ?? []).map((t: any) =>
    t.projects ? { ...t, projects: { ...t.projects, entity_id: primaryEntityId(t.projects) } } : t,
  )

  return (
    <TaskManager
      tasks={tasks}
      projects={projects}
      entities={entitiesRes.data ?? []}
      members={membersRes.data ?? []}
      currentUserId={user.id}
    />
  )
}

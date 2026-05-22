import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { TaskDetailFullPage } from './TaskDetailFullPage'

/**
 * Dedicated task detail page. Reached primarily by clicking a violet
 * `[[Task: ...|<id>]]` pill from a workspace page. We fetch the task row
 * (RLS scopes to the caller's org), the supporting collections
 * (projects/entities/members) used by `TaskDetailPanel`, and render a
 * full-page wrapper. A 404 surfaces if the task is archived or not in the
 * caller's org — same posture as a broken link.
 */
export default async function TaskDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }

  const [taskRes, projectsRes, entitiesRes, membersRes] = await Promise.all([
    (supabase as any)
      .from('tasks')
      .select('*, projects(id, name, entity_id), entities(id, name, type, color)')
      .eq('id', params.id)
      .eq('archived', false)
      .maybeSingle(),
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

  if (!taskRes.data) notFound()

  return (
    <div className="mx-auto max-w-3xl p-4">
      <div className="mb-4 flex items-center gap-2 text-sm">
        <Link href="/dashboard/tasks" className="text-indigo-600 hover:underline">← All tasks</Link>
        <span className="text-gray-300">·</span>
        <span className="text-gray-500 truncate">{taskRes.data.title}</span>
      </div>
      <TaskDetailFullPage
        task={taskRes.data}
        projects={projectsRes.data ?? []}
        entities={entitiesRes.data ?? []}
        members={membersRes.data ?? []}
      />
    </div>
  )
}

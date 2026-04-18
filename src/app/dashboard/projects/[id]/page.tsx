import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ProjectDetail } from '@/components/projects/ProjectDetail'

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [projectResult, tasksResult, updatesResult, filesResult, entitiesResult] = await Promise.all([
    supabase.from('projects').select('*').eq('id', params.id).single(),
    supabase.from('tasks').select('*').eq('project_id', params.id).eq('archived', false).order('created_at'),
    (supabase as any).from('project_updates').select('*').eq('project_id', params.id).order('created_at', { ascending: false }),
    (supabase as any).from('project_files').select('*').eq('project_id', params.id).order('created_at', { ascending: false }),
    supabase.from('entities').select('*').eq('active', true).order('name'),
  ])

  if (!projectResult.data) notFound()

  const entityMap = Object.fromEntries((entitiesResult.data ?? []).map((e: any) => [e.id, e]))

  return (
    <ProjectDetail
      project={projectResult.data}
      tasks={tasksResult.data ?? []}
      updates={updatesResult.data ?? []}
      files={filesResult.data ?? []}
      entity={entityMap[projectResult.data.entity_id]}
      entities={entitiesResult.data ?? []}
    />
  )
}

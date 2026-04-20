import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { ProjectDetail } from '@/components/projects/ProjectDetail'
import { fetchGitHubCommits } from '@/app/api/integrations/actions'

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await (supabase as any).from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }

  const [projectResult, tasksResult, updatesResult, filesResult, entitiesResult, membersResult] = await Promise.all([
    (supabase as any).from('projects').select('*').eq('id', params.id).single(),
    (supabase as any).from('tasks').select('*').eq('project_id', params.id).eq('archived', false).order('created_at'),
    (supabase as any).from('project_updates').select('*').eq('project_id', params.id).order('created_at', { ascending: false }),
    (supabase as any).from('project_files').select('*').eq('project_id', params.id).order('created_at', { ascending: false }),
    supabase.from('entities').select('*').eq('active', true).order('name'),
    profile?.org_id
      ? (supabase as any).from('user_profiles').select('id, full_name, email').eq('org_id', profile.org_id).order('full_name')
      : Promise.resolve({ data: [] }),
  ])

  if (!projectResult.data) notFound()

  const entityMap = Object.fromEntries((entitiesResult.data ?? []).map((e: any) => [e.id, e]))
  const githubUrl: string | null = (projectResult.data as any).github_url ?? null
  const commits = githubUrl ? await fetchGitHubCommits(githubUrl, 20).catch(() => []) : []

  return (
    <ProjectDetail
      project={projectResult.data}
      tasks={tasksResult.data ?? []}
      updates={updatesResult.data ?? []}
      files={filesResult.data ?? []}
      entity={entityMap[projectResult.data.entity_id]}
      entities={entitiesResult.data ?? []}
      initialCommits={commits}
      initialGithubUrl={githubUrl}
      members={membersResult.data ?? []}
    />
  )
}

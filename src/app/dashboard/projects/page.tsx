import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProjectsClient } from '@/components/projects/ProjectsClient'
import { fetchProjectEntityMap } from '@/lib/entities/multi-entity'

export default async function ProjectsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [projectsResult, entitiesResult] = await Promise.all([
    supabase.from('projects').select('*').eq('archived', false as any).order('updated_at', { ascending: false }),
    supabase.from('entities').select('*').eq('active', true).order('name'),
  ])

  const projects = projectsResult.data ?? []
  const projectEntities = await fetchProjectEntityMap(supabase, projects.map((p: { id: string }) => p.id))

  return <ProjectsClient projects={projects} entities={entitiesResult.data ?? []} projectEntities={projectEntities} />
}

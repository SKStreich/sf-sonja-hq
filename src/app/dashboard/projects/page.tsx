import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProjectsClient } from '@/components/projects/ProjectsClient'

export default async function ProjectsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: projects }, { data: entities }] = await Promise.all([
    supabase
      .from('projects')
      .select('*')
      .eq('archived', false as any)
      .order('updated_at', { ascending: false }),
    supabase
      .from('entities')
      .select('*')
      .eq('active', true)
      .order('name'),
  ])

  return <ProjectsClient projects={projects ?? []} entities={entities ?? []} />
}

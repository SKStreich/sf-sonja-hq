import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProjectsClient, type ProjectTask } from '@/components/projects/ProjectsClient'
import { fetchProjectEntityMap } from '@/lib/entities/multi-entity'
import { fetchProjectAreaMap } from '@/lib/areas/junctions'
import { computeProgress, type TaskProgress } from '@/lib/projects/progress'

export default async function ProjectsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [projectsResult, entitiesResult, tasksResult, areasResult] = await Promise.all([
    supabase.from('projects').select('*').eq('archived', false as any).order('updated_at', { ascending: false }),
    supabase.from('entities').select('*').eq('active', true).order('name'),
    (supabase as any).from('tasks').select('id,title,due_date,status,project_id').eq('archived', false),
    (supabase as any).from('areas').select('id,entity,name,slug,sort_order').order('entity').order('sort_order'),
  ])

  const projects = projectsResult.data ?? []
  const projectEntities = await fetchProjectEntityMap(supabase, projects.map((p: { id: string }) => p.id))
  const projectAreas = await fetchProjectAreaMap(supabase, projects.map((p: { id: string }) => p.id))

  // Per-project completion (done ÷ non-cancelled) + the task list for the
  // timeline view (tasks plotted alongside their project on the Gantt).
  const tasks = (tasksResult.data ?? []) as ProjectTask[]
  const tasksByProject: Record<string, ProjectTask[]> = {}
  for (const t of tasks) {
    if (!t.project_id) continue
    ;(tasksByProject[t.project_id] ??= []).push(t)
  }
  const progress: Record<string, TaskProgress> = {}
  for (const p of projects as { id: string }[]) {
    progress[p.id] = computeProgress(tasksByProject[p.id] ?? [])
  }

  return (
    <ProjectsClient
      projects={projects}
      entities={entitiesResult.data ?? []}
      projectEntities={projectEntities}
      areas={areasResult.data ?? []}
      projectAreas={projectAreas}
      progress={progress}
      tasksByProject={tasksByProject}
    />
  )
}

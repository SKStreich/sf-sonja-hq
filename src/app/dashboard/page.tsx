import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardHome } from '@/components/dashboard/DashboardHome'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const today = new Date().toISOString().slice(0, 10)

  const { data: profile } = await (supabase as any).from('user_profiles').select('full_name').eq('id', user.id).single() as { data: { full_name: string | null } | null }
  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'there'

  const [
    { data: todayTasks },
    { data: overdueTasks },
    { data: activeProjects },
    { data: recentLog },
    { data: recentKnowledge },
    { count: openTaskCount },
    { count: activeProjectCount },
    { count: overdueTaskCount },
    { count: rawIdeaCount },
    { data: allOpenTasks },
    { data: allActiveProjects },
    { data: assignedTasks },
  ] = await Promise.all([
    (supabase as any).from('tasks').select('id,title,priority,due_date,project_id,projects(id,name)')
      .eq('gtd_bucket', 'today').eq('archived', false)
      .not('status', 'in', '("done","cancelled")')
      .order('priority'),
    (supabase as any).from('tasks').select('id,title,priority,due_date,gtd_bucket,project_id,projects(id,name)')
      .lt('due_date', today).eq('archived', false)
      .not('status', 'in', '("done","cancelled")')
      .neq('gtd_bucket', 'today')
      .order('due_date', { ascending: true }).limit(10),
    supabase.from('projects').select('id,name,status,phase,priority,due_date,next_action,next_action_due,entities(name,type)')
      .eq('status', 'active')
      .order('next_action_due', { ascending: true, nullsFirst: false })
      .order('name').limit(8),
    (supabase as any).from('project_updates').select('id,content,update_type,created_at,project_id,projects(id,name)')
      .order('created_at', { ascending: false }).limit(6),
    (supabase as any).from('knowledge_entries')
      .select('id,kind,title,summary,body,entity,idea_status,created_at')
      .eq('access', 'standard').eq('status', 'active')
      .order('created_at', { ascending: false }).limit(5),
    (supabase as any).from('tasks').select('*', { count: 'exact', head: true })
      .eq('archived', false).not('status', 'in', '("done","cancelled")'),
    supabase.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    (supabase as any).from('tasks').select('id', { count: 'exact', head: true })
      .lt('due_date', today).eq('archived', false)
      .not('status', 'in', '("done","cancelled")'),
    (supabase as any).from('knowledge_entries').select('id', { count: 'exact', head: true })
      .eq('kind', 'idea').eq('idea_status', 'raw').eq('status', 'active'),
    (supabase as any).from('tasks').select('entity_id, entities(id,name,type)')
      .eq('archived', false).not('status', 'in', '("done","cancelled")'),
    supabase.from('projects').select('entity_id, entities(id,name,type)').eq('status', 'active'),
    (supabase as any).from('tasks').select('id,title,priority,due_date,project_id,projects(id,name)')
      .eq('assignee_id', user.id).eq('archived', false)
      .not('status', 'in', '("done","cancelled")')
      .order('due_date', { ascending: true, nullsFirst: false }).limit(10),
  ])

  // Build per-entity breakdown
  const entityMap: Record<string, { id: string; name: string; type: string; taskCount: number; projectCount: number }> = {}
  const addEntity = (e: any) => {
    if (!e) return
    const ent = Array.isArray(e) ? e[0] : e
    if (!ent?.id) return
    if (!entityMap[ent.id]) entityMap[ent.id] = { id: ent.id, name: ent.name, type: ent.type, taskCount: 0, projectCount: 0 }
  }
  ;(allOpenTasks ?? []).forEach((t: any) => { addEntity(t.entities); if (t.entities) { const id = Array.isArray(t.entities) ? t.entities[0]?.id : t.entities?.id; if (id && entityMap[id]) entityMap[id].taskCount++ } })
  ;(allActiveProjects ?? []).forEach((p: any) => { addEntity(p.entities); if (p.entities) { const id = Array.isArray(p.entities) ? p.entities[0]?.id : p.entities?.id; if (id && entityMap[id]) entityMap[id].projectCount++ } })
  const entityBreakdown = Object.values(entityMap).sort((a, b) => (b.taskCount + b.projectCount) - (a.taskCount + a.projectCount))

  const insights = {
    overdueTaskCount: overdueTaskCount ?? 0,
    rawIdeaCount: rawIdeaCount ?? 0,
    todayTaskCount: (todayTasks ?? []).length,
  }

  return (
    <DashboardHome
      displayName={displayName}
      todayTasks={todayTasks ?? []}
      overdueTasks={overdueTasks ?? []}
      activeProjects={activeProjects ?? []}
      recentLog={recentLog ?? []}
      recentKnowledge={recentKnowledge ?? []}
      openTaskCount={openTaskCount ?? 0}
      activeProjectCount={activeProjectCount ?? 0}
      entityBreakdown={entityBreakdown}
      insights={insights}
      assignedTasks={assignedTasks ?? []}
    />
  )
}

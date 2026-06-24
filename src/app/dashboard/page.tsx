import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardHome } from '@/components/dashboard/DashboardHome'
import { loadInitialActivity } from '@/lib/activity-feed.server'
import { ENTITY_ORDER, sortEntitySlugs } from '@/lib/entities/config'

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
    activityFeed,
    { data: recentKnowledge },
    { count: openTaskCount },
    { count: activeProjectCount },
    { count: overdueTaskCount },
    { count: rawIdeaCount },
    { data: allOpenTasks },
    { data: allActiveProjects },
    { data: assignedTasks },
    { data: allEntities },
    { data: calendarTasks },
    { data: calendarProjects },
    { count: inboxCount },
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
    supabase.from('projects').select('id,name,status,phase,priority,due_date,next_action,next_action_due,project_entities(entities(name,type))')
      .eq('status', 'active')
      .order('next_action_due', { ascending: true, nullsFirst: false })
      .order('name').limit(8),
    loadInitialActivity(),
    (supabase as any).from('knowledge_entries')
      .select('id,kind,title,summary,body,idea_status,created_at,knowledge_entry_entities(entity)')
      .eq('access', 'standard').eq('status', 'active').eq('triage_status', 'filed')
      .order('created_at', { ascending: false }).limit(5),
    (supabase as any).from('tasks').select('*', { count: 'exact', head: true })
      .eq('archived', false).not('status', 'in', '("done","cancelled")'),
    supabase.from('projects').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    (supabase as any).from('tasks').select('id', { count: 'exact', head: true })
      .lt('due_date', today).eq('archived', false)
      .not('status', 'in', '("done","cancelled")'),
    (supabase as any).from('knowledge_entries').select('id', { count: 'exact', head: true })
      .eq('kind', 'idea').eq('idea_status', 'raw').eq('status', 'active').eq('triage_status', 'filed'),
    (supabase as any).from('tasks').select('entity_id, entities(id,name,type)')
      .eq('archived', false).not('status', 'in', '("done","cancelled")'),
    supabase.from('projects').select('project_entities(entities(id,name,type))').eq('status', 'active'),
    (supabase as any).from('tasks').select('id,title,priority,due_date,project_id,projects(id,name)')
      .eq('assignee_id', user.id).eq('archived', false)
      .not('status', 'in', '("done","cancelled")')
      .order('due_date', { ascending: true, nullsFirst: false }).limit(10),
    // All active entities — seed a card for every entity, even with zero activity.
    supabase.from('entities').select('id,name,type').eq('active', true),
    // Calendar feed: every dated, non-archived task + every dated open project.
    (supabase as any).from('tasks')
      .select('id,title,due_date,status,priority,project_id,projects(id,name)')
      .not('due_date', 'is', null).eq('archived', false),
    supabase.from('projects').select('id,name,due_date')
      .not('due_date', 'is', null).eq('archived', false as any).neq('status', 'complete'),
    // Triage inbox count (Sprint 13) — un-filed quick captures awaiting a home.
    (supabase as any).from('knowledge_entries').select('id', { count: 'exact', head: true })
      .eq('access', 'standard').eq('status', 'active').eq('triage_status', 'inbox'),
  ])

  // Normalize junction embeds back to the shapes the UI expects:
  //  - projects: `entities` = array of {id?,name,type} entity objects (from project_entities)
  //  - knowledge: `entity` = primary slug (from knowledge_entry_entities)
  const projectEntityObjects = (p: any) =>
    ((p?.project_entities ?? []) as any[]).map((pe) => pe?.entities).filter(Boolean)
  ;(activeProjects ?? []).forEach((p: any) => { p.entities = projectEntityObjects(p) })
  ;(allActiveProjects ?? []).forEach((p: any) => { p.entities = projectEntityObjects(p) })
  ;(recentKnowledge ?? []).forEach((k: any) => {
    k.entity = sortEntitySlugs(((k?.knowledge_entry_entities ?? []) as any[]).map((r) => r.entity))[0] ?? 'personal'
  })

  // Build per-entity breakdown — seed EVERY active entity (so empty entities
  // still get a tally card), then count open tasks + active projects.
  const entityMap: Record<string, { id: string; name: string; type: string; taskCount: number; projectCount: number }> = {}
  ;(allEntities ?? []).forEach((e: any) => {
    if (e?.id) entityMap[e.id] = { id: e.id, name: e.name, type: e.type, taskCount: 0, projectCount: 0 }
  })
  const addEntity = (e: any) => {
    if (!e) return
    const ent = Array.isArray(e) ? e[0] : e
    if (!ent?.id) return
    if (!entityMap[ent.id]) entityMap[ent.id] = { id: ent.id, name: ent.name, type: ent.type, taskCount: 0, projectCount: 0 }
  }
  ;(allOpenTasks ?? []).forEach((t: any) => { addEntity(t.entities); if (t.entities) { const id = Array.isArray(t.entities) ? t.entities[0]?.id : t.entities?.id; if (id && entityMap[id]) entityMap[id].taskCount++ } })
  ;(allActiveProjects ?? []).forEach((p: any) => {
    for (const ent of (p.entities ?? [])) {
      addEntity(ent)
      if (ent?.id && entityMap[ent.id]) entityMap[ent.id].projectCount++
    }
  })
  const entityBreakdown = Object.values(entityMap).sort((a, b) => {
    const byActivity = (b.taskCount + b.projectCount) - (a.taskCount + a.projectCount)
    if (byActivity !== 0) return byActivity
    return ENTITY_ORDER.indexOf(a.type) - ENTITY_ORDER.indexOf(b.type)
  })

  const insights = {
    overdueTaskCount: overdueTaskCount ?? 0,
    rawIdeaCount: rawIdeaCount ?? 0,
    todayTaskCount: (todayTasks ?? []).length,
    inboxCount: inboxCount ?? 0,
  }

  // Calendar events — dated tasks (any status, to show completed too) + dated
  // open projects, normalized to a single shape the calendar card renders.
  const calendarEvents = [
    ...((calendarTasks ?? []) as any[]).map((t) => {
      const proj = Array.isArray(t.projects) ? t.projects[0] : t.projects
      return {
        id: t.id,
        title: t.title,
        date: t.due_date as string,
        type: 'task' as const,
        status: t.status ?? null,
        priority: t.priority ?? null,
        subtitle: proj?.name ?? null,
        href: t.project_id ? `/dashboard/projects/${t.project_id}` : '/dashboard/tasks',
      }
    }),
    ...((calendarProjects ?? []) as any[]).map((p) => ({
      id: `project-${p.id}`,
      title: p.name,
      date: p.due_date as string,
      type: 'project' as const,
      status: null,
      priority: null,
      subtitle: 'Project due',
      href: `/dashboard/projects/${p.id}`,
    })),
  ]

  return (
    <DashboardHome
      displayName={displayName}
      todayTasks={todayTasks ?? []}
      overdueTasks={overdueTasks ?? []}
      activeProjects={activeProjects ?? []}
      activityRows={activityFeed.rows}
      activityNextCursor={activityFeed.nextCursor}
      recentKnowledge={recentKnowledge ?? []}
      openTaskCount={openTaskCount ?? 0}
      activeProjectCount={activeProjectCount ?? 0}
      entityBreakdown={entityBreakdown}
      insights={insights}
      assignedTasks={assignedTasks ?? []}
      calendarEvents={calendarEvents}
    />
  )
}

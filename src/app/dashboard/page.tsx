import { createClient } from '@/lib/supabase/server'

export default async function DashboardPage() {
  const supabase = createClient()

  const [projectsResult, tasksResult, ideasResult, chatsResult] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact' }).eq('status', 'active'),
    supabase.from('tasks').select('id', { count: 'exact' }).not('status', 'eq', 'done'),
    supabase.from('ideas').select('id', { count: 'exact' }).eq('status', 'raw'),
    supabase.from('chat_history').select('id', { count: 'exact' }),
  ])

  const metrics = {
    activeProjects: projectsResult.count ?? 0,
    openTasks: tasksResult.count ?? 0,
    rawIdeas: ideasResult.count ?? 0,
    indexedChats: chatsResult.count ?? 0,
  }

  const today = new Date().toISOString().split('T')[0]
  const in7Days = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const { data: upcomingTasks } = await supabase
    .from('tasks').select('*, entities(name, type, color)')
    .not('status', 'eq', 'done').not('status', 'eq', 'parked')
    .gte('due_date', today).lte('due_date', in7Days)
    .order('due_date').limit(5)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricChip label="Active Projects" value={metrics.activeProjects} icon="📋" />
        <MetricChip label="Open Tasks" value={metrics.openTasks} icon="✅" />
        <MetricChip label="Raw Ideas" value={metrics.rawIdeas} icon="💡" />
        <MetricChip label="Indexed Chats" value={metrics.indexedChats} icon="💬" />
      </div>
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Due This Week</h2>
        {upcomingTasks && upcomingTasks.length > 0 ? (
          <div className="space-y-3">
            {upcomingTasks.map((task) => (
              <div key={task.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: (task.entities as any)?.color ?? '#6366F1' }} />
                  <span className="text-white text-sm">{task.title}</span>
                </div>
                <span className="text-xs text-gray-500">{task.due_date}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">No tasks due this week. 🎉</p>
        )}
      </div>
    </div>
  )
}

function MetricChip({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-2xl font-bold text-white">{value}</span>
      </div>
      <p className="text-xs text-gray-400">{label}</p>
    </div>
  )
}

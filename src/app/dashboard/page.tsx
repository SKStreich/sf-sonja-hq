import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { FocusBanner } from '@/components/dashboard/FocusBanner'
import { PriorityFeed } from '@/components/dashboard/PriorityFeed'
import { QuickCaptureButton } from '@/components/capture/QuickCaptureButton'
import { StatsRow } from '@/components/dashboard/StatsRow'

export default async function DashboardPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: focusNote } = await supabase
    .from('focus_notes')
    .select('*')
    .eq('user_id', user.id)
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { count: openWOCount } = await supabase
    .from('work_orders')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'open')

  const since = new Date()
  since.setDate(since.getDate() - 7)
  const { count: recentIdeasCount } = await supabase
    .from('captures')
    .select('*', { count: 'exact', head: true })
    .eq('type', 'idea')
    .eq('reviewed', false)
    .gte('created_at', since.toISOString())

  const { data: recentCaptures } = await supabase
    .from('captures')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  const stats = {
    openWorkOrders: openWOCount ?? 0,
    unreviewedIdeas: recentIdeasCount ?? 0,
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-40 border-b border-gray-800 bg-gray-950/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <span className="text-xl font-bold tracking-tight">🏢 Sonja HQ</span>
            <span className="hidden text-xs text-gray-500 sm:block">
              {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <QuickCaptureButton />
            <form action="/api/auth/signout" method="POST">
              <button type="submit" className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8 space-y-8">
        <FocusBanner focusNote={focusNote} userId={user.id} />
        <StatsRow stats={stats} />
        <section>
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-widest text-gray-500">Recent Captures</h2>
          <PriorityFeed captures={recentCaptures ?? []} />
        </section>
      </main>
    </div>
  )
}

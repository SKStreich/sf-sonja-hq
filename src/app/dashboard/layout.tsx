import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardNav } from '@/components/layout/DashboardNav'
import { DashboardShell } from '@/components/layout/DashboardShell'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [
    { data: profile },
    { data: entities },
    { data: notifications },
  ] = await Promise.all([
    supabase.from('user_profiles').select('*, orgs(*)').eq('id', user.id).single(),
    supabase.from('entities').select('*').eq('active', true).order('name'),
    (supabase as any).from('notifications')
      .select('id, type, entity_type, entity_id, title, message, read, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  return (
    <DashboardShell
      nav={
        <DashboardNav
          user={user}
          profile={profile}
          entities={entities ?? []}
          notifications={notifications ?? []}
        />
      }
    >
      {children}
    </DashboardShell>
  )
}

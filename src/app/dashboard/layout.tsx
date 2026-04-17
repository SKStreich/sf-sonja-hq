import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { DashboardNav } from '@/components/layout/DashboardNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('user_profiles').select('*, orgs(*)').eq('id', user.id).single()
  const { data: entities } = await supabase.from('entities').select('*').eq('active', true).order('name')

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <DashboardNav user={user} profile={profile} entities={entities ?? []} />
      <main className="pt-16">{children}</main>
    </div>
  )
}

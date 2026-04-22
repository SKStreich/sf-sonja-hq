import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ProfileClient } from '@/components/profile/ProfileClient'

export default async function ProfilePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await (supabase as any)
    .from('user_profiles')
    .select('full_name, role, created_at, org_id, orgs(name)')
    .eq('id', user.id)
    .single()

  return (
    <ProfileClient
      userId={user.id}
      fullName={profile?.full_name ?? ''}
      email={user.email ?? ''}
      role={profile?.role ?? 'member'}
      orgName={(profile?.orgs as any)?.name ?? 'Sonja HQ'}
      memberSince={profile?.created_at ?? user.created_at}
    />
  )
}

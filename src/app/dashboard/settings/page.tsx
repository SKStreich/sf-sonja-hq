import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient } from '@/components/settings/SettingsClient'
import { isNotionConfigured } from '@/lib/notion/client'

export default async function SettingsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await (supabase as any)
    .from('user_profiles')
    .select('id, full_name, capture_api_key, role, org_id')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'member' || profile?.role === 'read_only') redirect('/dashboard/profile')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'

  // Fetch org members + pending invitations (only if admin/owner)
  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin'

  const [{ data: members }, { data: invitations }, { data: notionIntegration }] = await Promise.all([
    supabase
      .from('user_profiles')
      .select('id, full_name, email, role, created_at')
      .eq('org_id', profile?.org_id)
      .order('created_at'),
    isAdmin
      ? (supabase as any)
          .from('org_invitations')
          .select('id, email, role, status, created_at, expires_at, accepted_at, token')
          .eq('org_id', profile?.org_id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    (supabase as any)
      .from('integrations')
      .select('last_sync_at')
      .eq('type', 'notion')
      .maybeSingle(),
  ])

  return (
    <SettingsClient
      captureApiKey={profile?.capture_api_key ?? ''}
      appUrl={appUrl}
      userEmail={user.email ?? ''}
      currentUserId={user.id}
      currentUserRole={profile?.role ?? 'member'}
      members={members ?? []}
      pendingInvitations={invitations ?? []}
      notionConfigured={isNotionConfigured()}
      notionLastSync={notionIntegration?.last_sync_at ?? null}
    />
  )
}

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsClient } from '@/components/settings/SettingsClient'
import { isNotionConfigured } from '@/lib/notion/client'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  try {
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
    const isAdmin = profile?.role === 'owner' || profile?.role === 'admin'
    const orgId = profile?.org_id ?? null

    const [membersResult, invitationsResult, notionResult] = await Promise.allSettled([
      orgId
        ? supabase
            .from('user_profiles')
            .select('id, full_name, email, role, created_at')
            .eq('org_id', orgId)
            .order('created_at')
        : Promise.resolve({ data: [] }),
      isAdmin && orgId
        ? (supabase as any)
            .from('org_invitations')
            .select('id, email, role, status, created_at, expires_at, accepted_at, token')
            .eq('org_id', orgId)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      (supabase as any)
        .from('integrations')
        .select('last_sync_at')
        .eq('type', 'notion')
        .maybeSingle(),
    ])

    const members = membersResult.status === 'fulfilled' ? (membersResult.value as any).data : null
    const invitations = invitationsResult.status === 'fulfilled' ? (invitationsResult.value as any).data : null
    const notionIntegration = notionResult.status === 'fulfilled' ? (notionResult.value as any).data : null

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
  } catch (err: any) {
    // redirect() throws internally — let it propagate; catch everything else
    if (err?.digest?.startsWith('NEXT_REDIRECT')) throw err
    throw err // re-throw so error.tsx boundary catches it
  }
}

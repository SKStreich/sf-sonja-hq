import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { AcceptInviteButton } from './AcceptInviteButton'

export default async function AcceptInvitePage({ params }: { params: { token: string } }) {
  const admin = createAdminClient()

  // Look up the invitation (admin client so RLS doesn't block)
  const { data: invitation } = await (admin as any)
    .from('org_invitations')
    .select('*, orgs(name)')
    .eq('token', params.token)
    .single()

  // Invalid token
  if (!invitation) {
    return (
      <InvitePage>
        <h1 className="text-xl font-bold text-white mb-2">Invalid Invitation</h1>
        <p className="text-sm text-gray-500 mb-6">This invitation link is invalid or has already been used.</p>
        <Link href="/login" className="text-sm text-indigo-400 hover:text-indigo-300">← Go to login</Link>
      </InvitePage>
    )
  }

  // Expired
  if (invitation.status !== 'pending' || new Date(invitation.expires_at) < new Date()) {
    return (
      <InvitePage>
        <h1 className="text-xl font-bold text-white mb-2">Invitation Expired</h1>
        <p className="text-sm text-gray-500 mb-6">This invitation has expired. Ask the sender to invite you again.</p>
        <Link href="/login" className="text-sm text-indigo-400 hover:text-indigo-300">← Go to login</Link>
      </InvitePage>
    )
  }

  // Check if the current user is logged in
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const orgName = invitation.orgs?.name ?? 'Sonja HQ'
  const inviterName = 'A teammate'
  const roleLabel = { admin: 'Admin', member: 'Member', read_only: 'Viewer' }[invitation.role as string] ?? 'Member'

  return (
    <InvitePage>
      <div className="text-4xl mb-4">🏢</div>
      <h1 className="text-xl font-bold text-white mb-2">You're invited to {orgName}</h1>
      <p className="text-sm text-gray-500 mb-1">
        <span className="text-gray-300">{inviterName}</span> has invited you to join as a{' '}
        <span className="text-indigo-400">{roleLabel}</span>.
      </p>
      <p className="text-xs text-gray-600 mb-8">
        Invitation sent to <span className="text-gray-400">{invitation.email}</span>
      </p>

      {user ? (
        user.email?.toLowerCase() === invitation.email ? (
          <AcceptInviteButton token={params.token} />
        ) : (
          <div className="text-center">
            <p className="text-sm text-yellow-500 mb-4">
              You're signed in as <strong>{user.email}</strong>, but this invitation is for <strong>{invitation.email}</strong>.
            </p>
            <p className="text-xs text-gray-600">Sign out and sign in with the invited email address.</p>
          </div>
        )
      ) : (
        <div className="space-y-3 w-full">
          <Link
            href={`/login?redirect=/invite/${params.token}`}
            className="block w-full rounded-lg bg-indigo-600 px-5 py-2.5 text-center text-sm font-semibold text-white hover:bg-indigo-500 transition-colors"
          >
            Sign in to accept
          </Link>
          <Link
            href={`/signup?redirect=/invite/${params.token}&email=${encodeURIComponent(invitation.email)}`}
            className="block w-full rounded-lg border border-gray-700 px-5 py-2.5 text-center text-sm text-gray-400 hover:border-gray-600 hover:text-gray-200 transition-colors"
          >
            Create an account
          </Link>
        </div>
      )}
    </InvitePage>
  )
}

function InvitePage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center">
        {children}
      </div>
    </div>
  )
}

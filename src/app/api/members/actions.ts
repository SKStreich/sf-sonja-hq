'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { Resend } from 'resend'

async function getOrgContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles')
    .select('org_id, role, full_name, email')
    .eq('id', user.id)
    .single() as { data: { org_id: string; role: string; full_name: string | null; email: string } | null }
  if (!profile) throw new Error('No profile')
  return { supabase, user, profile, org_id: profile.org_id }
}

function requireAdmin(role: string) {
  if (!['owner', 'admin'].includes(role)) throw new Error('Admin access required')
}

// ── Invitations ───────────────────────────────────────────────────────────────

export async function inviteOrgMember(email: string, role: 'admin' | 'member' | 'read_only' = 'member') {
  const { supabase, profile, org_id } = await getOrgContext()
  requireAdmin(profile.role)

  const admin = createAdminClient()
  const normalizedEmail = email.trim().toLowerCase()

  // Check not already a member
  const { data: existing } = await supabase
    .from('user_profiles')
    .select('id')
    .eq('org_id', org_id)
    .eq('email', normalizedEmail)
    .maybeSingle()
  if (existing) throw new Error('This person is already a member')

  // Upsert invitation (re-invite resets token + expiry)
  const { data: invitation, error } = await (admin as any)
    .from('org_invitations')
    .upsert({
      org_id,
      invited_by: (await supabase.auth.getUser()).data.user!.id,
      email: normalizedEmail,
      role,
      status: 'pending',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }, { onConflict: 'org_id,email', ignoreDuplicates: false })
    .select('token')
    .single()

  if (error) throw new Error('Failed to create invitation: ' + error.message)

  // Fetch org name for the email
  const { data: org } = await (supabase as any).from('orgs').select('name').eq('id', org_id).single() as { data: { name: string } | null }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'
  const inviteUrl = `${appUrl}/invite/${invitation.token}`

  // Send invite email via Resend
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    const resend = new Resend(resendKey)
    await resend.emails.send({
      from: 'Sonja HQ <noreply@streichforce.com>',
      to: normalizedEmail,
      subject: `${profile.full_name ?? 'Someone'} invited you to ${org?.name ?? 'Sonja HQ'}`,
      html: buildInviteEmail({
        inviterName: profile.full_name ?? profile.email ?? 'A teammate',
        orgName: org?.name ?? 'Sonja HQ',
        role,
        inviteUrl,
        expiresInDays: 7,
      }),
    })
  }

  revalidatePath('/dashboard/settings')
  return { inviteUrl }
}

export async function revokeInvitation(invitationId: string) {
  const { supabase, profile, org_id } = await getOrgContext()
  requireAdmin(profile.role)
  const { error } = await (supabase as any)
    .from('org_invitations')
    .delete()
    .eq('id', invitationId)
    .eq('org_id', org_id)
  if (error) throw new Error('Failed to revoke invitation')
  revalidatePath('/dashboard/settings')
}

export async function acceptOrgInvite(token: string) {
  const { supabase, user } = await getOrgContext()
  const admin = createAdminClient()

  const { data: invitation, error } = await (admin as any)
    .from('org_invitations')
    .select('*')
    .eq('token', token)
    .eq('status', 'pending')
    .single()

  if (error || !invitation) throw new Error('Invalid or expired invitation')
  if (new Date(invitation.expires_at) < new Date()) {
    await (admin as any).from('org_invitations').update({ status: 'expired' }).eq('id', invitation.id)
    throw new Error('This invitation has expired')
  }

  const userEmail = user.email?.toLowerCase()
  if (userEmail !== invitation.email) {
    throw new Error(`This invitation was sent to ${invitation.email}. Please sign in with that account.`)
  }

  // Add to org
  const { error: profileError } = await (admin as any)
    .from('user_profiles')
    .upsert({
      id: user.id,
      org_id: invitation.org_id,
      email: userEmail,
      full_name: user.user_metadata?.full_name ?? null,
      role: invitation.role,
      active: true,
    }, { onConflict: 'id' })

  if (profileError) throw new Error('Failed to join org: ' + profileError.message)

  // Mark accepted
  await (admin as any).from('org_invitations').update({
    status: 'accepted',
    accepted_at: new Date().toISOString(),
  }).eq('id', invitation.id)

  revalidatePath('/dashboard')
}

// ── Member management ─────────────────────────────────────────────────────────

export async function updateMemberRole(memberId: string, role: 'admin' | 'member' | 'read_only') {
  const { supabase, profile, org_id } = await getOrgContext()
  requireAdmin(profile.role)
  const { error } = await (supabase as any)
    .from('user_profiles')
    .update({ role })
    .eq('id', memberId)
    .eq('org_id', org_id)
  if (error) throw new Error('Failed to update role')
  revalidatePath('/dashboard/settings')
}

export async function removeMember(memberId: string) {
  const { supabase, user, profile, org_id } = await getOrgContext()
  requireAdmin(profile.role)
  if (memberId === user.id) throw new Error('You cannot remove yourself')
  // Prevent removing the last owner
  const { count } = await (supabase as any)
    .from('user_profiles')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', org_id)
    .eq('role', 'owner')
  if ((count ?? 0) <= 1) {
    const { data: target } = await (supabase as any).from('user_profiles').select('role').eq('id', memberId).single() as { data: { role: string } | null }
    if (target?.role === 'owner') throw new Error('Cannot remove the last owner')
  }
  const { error } = await (supabase as any)
    .from('user_profiles')
    .delete()
    .eq('id', memberId)
    .eq('org_id', org_id)
  if (error) throw new Error('Failed to remove member')
  revalidatePath('/dashboard/settings')
}

// ── Task assignment ───────────────────────────────────────────────────────────

export async function assignTask(taskId: string, assigneeId: string | null) {
  const { supabase, org_id } = await getOrgContext()
  const { error } = await (supabase as any)
    .from('tasks')
    .update({ assignee_id: assigneeId })
    .eq('id', taskId)
  if (error) throw new Error('Failed to assign task')

  // Create notification for assignee
  if (assigneeId) {
    const { data: task } = await supabase
      .from('tasks')
      .select('title')
      .eq('id', taskId)
      .single()
    await (supabase as any).from('notifications').insert({
      user_id: assigneeId,
      org_id,
      type: 'assignment',
      entity_type: 'task',
      entity_id: taskId,
      title: 'Task assigned to you',
      message: (task as any)?.title ?? '',
      read: false,
    })
  }

  revalidatePath('/dashboard/tasks')
}

// ── Notifications ─────────────────────────────────────────────────────────────

export async function markNotificationRead(notificationId: string) {
  const { supabase } = await getOrgContext()
  await (supabase as any).from('notifications').update({ read: true }).eq('id', notificationId)
}

export async function markAllNotificationsRead() {
  const { supabase, user } = await getOrgContext()
  await (supabase as any).from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
  revalidatePath('/dashboard')
}

// ── Email template ────────────────────────────────────────────────────────────

function buildInviteEmail({ inviterName, orgName, role, inviteUrl, expiresInDays }: {
  inviterName: string; orgName: string; role: string; inviteUrl: string; expiresInDays: number
}) {
  const roleLabel = role === 'admin' ? 'Admin' : role === 'read_only' ? 'Viewer' : 'Member'
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e7eb; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 40px;">
    <h1 style="font-size: 20px; font-weight: 700; color: #fff; margin: 0 0 8px;">You're invited to ${orgName}</h1>
    <p style="color: #9ca3af; font-size: 14px; margin: 0 0 32px;">
      ${inviterName} has invited you to join <strong style="color: #e5e7eb;">${orgName}</strong> as a <strong style="color: #e5e7eb;">${roleLabel}</strong>.
    </p>
    <a href="${inviteUrl}" style="display: inline-block; background: #4f46e5; color: #fff; font-size: 14px; font-weight: 600; text-decoration: none; padding: 12px 28px; border-radius: 8px;">
      Accept Invitation
    </a>
    <p style="color: #6b7280; font-size: 12px; margin: 24px 0 0;">
      This invitation expires in ${expiresInDays} days. If you weren't expecting this, you can safely ignore it.
    </p>
  </div>
</body>
</html>`
}

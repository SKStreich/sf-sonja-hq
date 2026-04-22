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

export async function inviteOrgMember(email: string, role: 'admin' | 'member' | 'read_only' = 'member', customMessage?: string) {
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

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

  // Upsert invitation (re-invite resets token + expiry)
  const { data: invitation, error } = await (admin as any)
    .from('org_invitations')
    .upsert({
      org_id,
      invited_by: (await supabase.auth.getUser()).data.user!.id,
      email: normalizedEmail,
      role,
      status: 'pending',
      expires_at: expiresAt,
    }, { onConflict: 'org_id,email', ignoreDuplicates: false })
    .select('id, token')
    .single()

  if (error) throw new Error('Failed to create invitation: ' + error.message)

  // Revalidate immediately — invitation exists in DB regardless of email outcome
  revalidatePath('/dashboard/settings')

  // Fetch org name for the email
  const { data: org } = await (supabase as any).from('orgs').select('name').eq('id', org_id).single() as { data: { name: string } | null }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://your-app.vercel.app'
  const inviteUrl = `${appUrl}/invite/${invitation.token}`

  // Send invite email via Resend — non-fatal: invitation is already saved if this fails
  let emailSent = false
  let emailError: string | undefined
  const resendKey = process.env.RESEND_API_KEY
  if (resendKey) {
    try {
      const resend = new Resend(resendKey)
      await resend.emails.send({
        from: 'Streich Force HQ <info@streichforce.com>',
        to: normalizedEmail,
        subject: `${profile.full_name ?? 'Someone'} invited you to ${org?.name ?? 'Sonja HQ'}`,
        html: buildInviteEmail({
          inviterName: profile.full_name ?? profile.email ?? 'A teammate',
          orgName: org?.name ?? 'Sonja HQ',
          role,
          inviteUrl,
          expiresInDays: 7,
          customMessage,
        }),
      })
      emailSent = true
    } catch (e: any) {
      emailError = e?.message ?? 'Email send failed'
    }
  }

  return {
    inviteUrl,
    emailSent,
    emailError,
    invitation: {
      id: invitation.id,
      email: normalizedEmail,
      role,
      status: 'pending' as const,
      created_at: new Date().toISOString(),
      expires_at: expiresAt,
      token: invitation.token,
    },
  }
}

export async function resendInvitation(invitationId: string) {
  const { supabase, profile, org_id } = await getOrgContext()
  requireAdmin(profile.role)
  const admin = createAdminClient()

  // Fetch the existing invitation
  const { data: inv } = await (admin as any)
    .from('org_invitations')
    .select('email, role')
    .eq('id', invitationId)
    .eq('org_id', org_id)
    .single()
  if (!inv) throw new Error('Invitation not found')

  // Re-invite reuses inviteOrgMember which upserts token + expiry
  return inviteOrgMember(inv.email, inv.role)
}

export async function revokeInvitation(invitationId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { profile, org_id } = await getOrgContext()
    requireAdmin(profile.role)
    const admin = createAdminClient()
    const { error } = await (admin as any)
      .from('org_invitations')
      .update({ status: 'revoked' })
      .eq('id', invitationId)
      .eq('org_id', org_id)
    if (error) return { success: false, error: error.message }
    revalidatePath('/dashboard/settings')
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Unknown error' }
  }
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

function buildInviteEmail({ inviterName, orgName, role, inviteUrl, expiresInDays, customMessage }: {
  inviterName: string; orgName: string; role: string; inviteUrl: string; expiresInDays: number; customMessage?: string
}) {
  const roleLabel = role === 'admin' ? 'Admin' : role === 'read_only' ? 'Viewer' : 'Member'
  return `<!DOCTYPE html>
<html>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e5e7eb; margin: 0; padding: 40px 20px;">
  <div style="max-width: 520px; margin: 0 auto;">

    <!-- Logo / Brand header -->
    <div style="text-align: center; margin-bottom: 32px;">
      <div style="display: inline-flex; align-items: center; justify-content: center; width: 56px; height: 56px; background: #312e81; border-radius: 14px; margin-bottom: 12px;">
        <span style="font-size: 24px; font-weight: 800; color: #c7d2fe; letter-spacing: -1px;">SF</span>
      </div>
      <div style="font-size: 13px; font-weight: 600; color: #6b7280; letter-spacing: 0.08em; text-transform: uppercase;">Streich Force HQ</div>
    </div>

    <!-- Card -->
    <div style="background: #111827; border: 1px solid #1f2937; border-radius: 16px; padding: 40px;">
      <h1 style="font-size: 22px; font-weight: 700; color: #fff; margin: 0 0 10px;">You're invited to ${orgName}</h1>
      <p style="color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        <strong style="color: #e5e7eb;">${inviterName}</strong> has invited you to join
        <strong style="color: #e5e7eb;">${orgName}</strong> as a
        <strong style="color: #e5e7eb;">${roleLabel}</strong>.
      </p>

      ${customMessage ? `
      <div style="background: #1f2937; border-left: 3px solid #4f46e5; border-radius: 4px; padding: 14px 16px; margin-bottom: 28px;">
        <p style="color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0; font-style: italic;">"${customMessage}"</p>
        <p style="color: #6b7280; font-size: 12px; margin: 8px 0 0;">— ${inviterName}</p>
      </div>
      ` : ''}

      <a href="${inviteUrl}" style="display: inline-block; background: #4f46e5; color: #fff; font-size: 15px; font-weight: 600; text-decoration: none; padding: 14px 32px; border-radius: 10px; letter-spacing: 0.01em;">
        Accept Invitation →
      </a>

      <p style="color: #6b7280; font-size: 12px; margin: 28px 0 0; line-height: 1.6;">
        This invitation expires in ${expiresInDays} days.<br>
        If you weren't expecting this, you can safely ignore it.
      </p>
    </div>

    <!-- Signature / Footer -->
    <div style="text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid #1f2937;">
      <p style="color: #4b5563; font-size: 12px; margin: 0 0 4px;">Sent from <strong style="color: #6b7280;">Streich Force HQ</strong></p>
      <p style="color: #374151; font-size: 11px; margin: 0;">
        Questions? Reply to this email or contact us at
        <a href="mailto:info@streichforce.com" style="color: #4f46e5; text-decoration: none;">info@streichforce.com</a>
      </p>
    </div>

  </div>
</body>
</html>`
}

'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { randomBytes } from 'crypto'

export interface Share {
  id: string
  entry_id: string
  version_id: string | null
  token: string
  recipient_name: string
  recipient_email: string
  expires_at: string
  revoked_at: string | null
  created_at: string
}

async function getContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

function genToken(): string {
  return randomBytes(24).toString('base64url')
}

export async function listShares(entryId: string): Promise<Share[]> {
  const { supabase } = await getContext()
  const { data, error } = await (supabase as any)
    .from('knowledge_shares')
    .select('id, entry_id, version_id, token, recipient_name, recipient_email, expires_at, revoked_at, created_at')
    .eq('entry_id', entryId)
    .order('created_at', { ascending: false })
  if (error) throw new Error('Failed to list shares: ' + error.message)
  return (data ?? []) as Share[]
}

export async function createShare(input: {
  entryId: string
  recipientName: string
  recipientEmail: string
  expiresInDays: number
  versionLock: boolean
}): Promise<{ token: string; id: string }> {
  const { supabase, user, org_id } = await getContext()

  const recipient_name = input.recipientName.trim()
  const recipient_email = input.recipientEmail.trim().toLowerCase()
  if (!recipient_name) throw new Error('Recipient name is required')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient_email)) throw new Error('Valid email is required')
  const days = Math.max(1, Math.min(365, Math.floor(input.expiresInDays)))

  let version_id: string | null = null
  if (input.versionLock) {
    const { data: entry, error: eErr } = await (supabase as any)
      .from('knowledge_entries')
      .select('id, title, body, kind, entity, tags, mime_type, storage_path, rendered_html')
      .eq('id', input.entryId)
      .single()
    if (eErr || !entry) throw new Error('Entry not found')

    const { data: prev } = await (supabase as any)
      .from('knowledge_versions')
      .select('version')
      .eq('entry_id', entry.id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextVersion = (prev?.version ?? 0) + 1

    const { data: ver, error: vErr } = await (supabase as any)
      .from('knowledge_versions')
      .insert({
        entry_id: entry.id,
        version: nextVersion,
        title: entry.title,
        body: entry.body,
        kind: entry.kind,
        entity: entry.entity,
        tags: entry.tags,
        mime_type: entry.mime_type,
        storage_path: entry.storage_path,
        rendered_html: entry.rendered_html,
        created_by: user.id,
      })
      .select('id')
      .single()
    if (vErr) throw new Error('Failed to snapshot version: ' + vErr.message)
    version_id = ver.id as string
  }

  const token = genToken()
  const expires_at = new Date(Date.now() + days * 86400000).toISOString()

  const { data, error } = await (supabase as any)
    .from('knowledge_shares')
    .insert({
      org_id,
      entry_id: input.entryId,
      version_id,
      token,
      recipient_name,
      recipient_email,
      expires_at,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error) throw new Error('Failed to create share: ' + error.message)

  // Upsert a contact row for the recipient (consent stays false until they opt in).
  await (supabase as any)
    .from('contacts')
    .upsert({
      org_id,
      full_name: recipient_name,
      email: recipient_email,
      source: 'share',
      created_by: user.id,
    }, { onConflict: 'org_id,email', ignoreDuplicates: false })

  revalidatePath(`/dashboard/knowledge/${input.entryId}`)
  return { token, id: data.id as string }
}

export async function revokeShare(shareId: string, entryId: string) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any)
    .from('knowledge_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', shareId)
  if (error) throw new Error('Failed to revoke: ' + error.message)
  revalidatePath(`/dashboard/knowledge/${entryId}`)
}

export async function extendShare(shareId: string, entryId: string, additionalDays: number) {
  const { supabase } = await getContext()
  const days = Math.max(1, Math.min(365, Math.floor(additionalDays)))
  const { data: existing, error: rErr } = await (supabase as any)
    .from('knowledge_shares')
    .select('expires_at')
    .eq('id', shareId)
    .single()
  if (rErr || !existing) throw new Error('Share not found')
  const base = Math.max(Date.now(), new Date(existing.expires_at).getTime())
  const newExpires = new Date(base + days * 86400000).toISOString()
  const { error } = await (supabase as any)
    .from('knowledge_shares')
    .update({ expires_at: newExpires, revoked_at: null })
    .eq('id', shareId)
  if (error) throw new Error('Failed to extend: ' + error.message)
  revalidatePath(`/dashboard/knowledge/${entryId}`)
  return { expires_at: newExpires }
}

export interface SharedViewBase {
  shareId: string
  title: string
  recipient: string
  recipientEmail: string
  expiresAt: string
  consent: boolean
}
export type SharedView =
  | (SharedViewBase & { kind: 'html'; html: string })
  | (SharedViewBase & { kind: 'pdf'; signedUrl: string })
  | (SharedViewBase & { kind: 'text'; text: string; markdown: boolean })
  | (SharedViewBase & { kind: 'plain'; body: string })

/**
 * Server-only token resolver for the public /share/[token] route.
 * Uses the admin client to bypass RLS. Returns null for missing/revoked/expired tokens —
 * never reveals whether the entry exists.
 */
export async function resolveShareToken(token: string): Promise<SharedView | null> {
  if (!token || token.length < 8) return null

  const admin = createAdminClient()
  const { data: share } = await (admin as any)
    .from('knowledge_shares')
    .select('id, org_id, entry_id, version_id, recipient_name, recipient_email, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle()

  if (!share) return null
  if (share.revoked_at) return null
  if (new Date(share.expires_at).getTime() < Date.now()) return null

  const shareId = share.id as string
  const recipient = share.recipient_name as string
  const recipientEmail = share.recipient_email as string
  const expiresAt = share.expires_at as string

  // Lookup current consent from contacts (org_id + email).
  const { data: contact } = await (admin as any)
    .from('contacts')
    .select('consent_to_contact')
    .eq('org_id', share.org_id)
    .eq('email', recipientEmail)
    .maybeSingle()
  const consent = !!contact?.consent_to_contact

  if (share.version_id) {
    const { data: ver } = await (admin as any)
      .from('knowledge_versions')
      .select('title, body, mime_type, storage_path, rendered_html')
      .eq('id', share.version_id)
      .maybeSingle()
    if (!ver) return null
    return buildView({
      shareId, title: ver.title ?? 'Shared document',
      body: ver.body ?? '', mime: ver.mime_type ?? '',
      storage_path: ver.storage_path ?? null, rendered_html: ver.rendered_html ?? null,
      recipient, recipientEmail, expiresAt, consent, admin,
    })
  }

  const { data: entry } = await (admin as any)
    .from('knowledge_entries')
    .select('title, body, mime_type, storage_path, rendered_html, status')
    .eq('id', share.entry_id)
    .maybeSingle()
  if (!entry || entry.status !== 'active') return null

  return buildView({
    shareId, title: entry.title ?? 'Shared document',
    body: entry.body ?? '', mime: entry.mime_type ?? '',
    storage_path: entry.storage_path ?? null, rendered_html: entry.rendered_html ?? null,
    recipient, recipientEmail, expiresAt, consent, admin,
  })
}

async function buildView(args: {
  shareId: string
  title: string
  body: string
  mime: string
  storage_path: string | null
  rendered_html: string | null
  recipient: string
  recipientEmail: string
  expiresAt: string
  consent: boolean
  admin: any
}): Promise<SharedView> {
  const { shareId, title, body, mime, storage_path, rendered_html, recipient, recipientEmail, expiresAt, consent, admin } = args
  const base = { shareId, title, recipient, recipientEmail, expiresAt, consent }
  if (rendered_html) return { ...base, kind: 'html', html: rendered_html }
  if (mime === 'application/pdf' && storage_path) {
    const { data: signed } = await admin.storage.from('knowledge').createSignedUrl(storage_path, 60 * 30)
    if (signed?.signedUrl) return { ...base, kind: 'pdf', signedUrl: signed.signedUrl }
  }
  if (mime === 'text/markdown' || mime === 'text/plain') {
    return { ...base, kind: 'text', text: body, markdown: mime === 'text/markdown' }
  }
  return { ...base, kind: 'plain', body }
}

// ── Public actions for the share viewer (admin client; no auth required) ────

export async function setShareConsent(token: string, consent: boolean): Promise<{ ok: true }> {
  if (!token || token.length < 8) throw new Error('Invalid token')
  const admin = createAdminClient()
  const { data: share } = await (admin as any)
    .from('knowledge_shares')
    .select('id, org_id, recipient_name, recipient_email, expires_at, revoked_at, created_by')
    .eq('token', token)
    .maybeSingle()
  if (!share) throw new Error('Share not found')
  if (share.revoked_at) throw new Error('Share is revoked')
  if (new Date(share.expires_at).getTime() < Date.now()) throw new Error('Share is expired')

  await (admin as any)
    .from('contacts')
    .upsert({
      org_id: share.org_id,
      full_name: share.recipient_name,
      email: share.recipient_email,
      source: 'share',
      consent_to_contact: consent,
      consent_at: consent ? new Date().toISOString() : null,
      created_by: share.created_by,
    }, { onConflict: 'org_id,email', ignoreDuplicates: false })

  return { ok: true }
}

export async function submitForwardRequest(input: {
  token: string
  newRecipientName: string
  newRecipientEmail: string
  reason?: string
}): Promise<{ ok: true; requestId: string }> {
  const { token } = input
  if (!token || token.length < 8) throw new Error('Invalid token')
  const newName = input.newRecipientName.trim()
  const newEmail = input.newRecipientEmail.trim().toLowerCase()
  if (!newName) throw new Error('Recipient name is required')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error('Valid email is required')

  const admin = createAdminClient()
  const { data: share } = await (admin as any)
    .from('knowledge_shares')
    .select('id, org_id, recipient_email, created_by, entry_id, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle()
  if (!share) throw new Error('Share not found')
  if (share.revoked_at) throw new Error('Share is revoked')
  if (new Date(share.expires_at).getTime() < Date.now()) throw new Error('Share is expired')

  const { data: req, error } = await (admin as any)
    .from('share_forwarding_requests')
    .insert({
      org_id: share.org_id,
      share_id: share.id,
      requested_by_email: share.recipient_email,
      new_recipient_name: newName,
      new_recipient_email: newEmail,
      reason: input.reason?.slice(0, 500) ?? null,
      status: 'pending',
    })
    .select('id')
    .single()
  if (error) throw new Error('Failed to submit request: ' + error.message)

  // Notify the share owner
  await (admin as any).from('notifications').insert({
    user_id: share.created_by,
    org_id: share.org_id,
    type: 'share_forward_request',
    entity_type: 'share_forwarding_request',
    entity_id: req.id,
    title: 'Forward request',
    message: `${share.recipient_email} wants to forward to ${newName} <${newEmail}>`,
    read: false,
  })

  return { ok: true, requestId: req.id as string }
}

// ── Authenticated owner-side actions for forwarding requests ────────────────

export interface ForwardRequest {
  id: string
  share_id: string
  entry_id: string
  requested_by_email: string
  new_recipient_name: string
  new_recipient_email: string
  reason: string | null
  status: 'pending' | 'approved' | 'denied'
  created_at: string
  decided_at: string | null
}

export async function listForwardRequests(entryId?: string): Promise<ForwardRequest[]> {
  const { supabase, org_id } = await getContext()
  let q = (supabase as any)
    .from('share_forwarding_requests')
    .select('id, share_id, requested_by_email, new_recipient_name, new_recipient_email, reason, status, created_at, decided_at, knowledge_shares!share_forwarding_requests_share_id_fkey!inner(entry_id)')
    .eq('org_id', org_id)
    .order('created_at', { ascending: false })
  if (entryId) q = q.eq('knowledge_shares.entry_id', entryId)
  const { data, error } = await q
  if (error) throw new Error('Failed to load forwarding requests: ' + error.message)
  return (data ?? []).map((r: any) => ({
    id: r.id,
    share_id: r.share_id,
    entry_id: r.knowledge_shares?.entry_id,
    requested_by_email: r.requested_by_email,
    new_recipient_name: r.new_recipient_name,
    new_recipient_email: r.new_recipient_email,
    reason: r.reason,
    status: r.status,
    created_at: r.created_at,
    decided_at: r.decided_at,
  })) as ForwardRequest[]
}

export async function decideForwardRequest(
  requestId: string,
  decision: 'approved' | 'denied',
  expiresInDays = 7,
): Promise<{ token?: string; entryId?: string }> {
  const { supabase, user, org_id } = await getContext()
  const { data: req, error: rErr } = await (supabase as any)
    .from('share_forwarding_requests')
    .select('id, share_id, status, new_recipient_name, new_recipient_email, knowledge_shares!share_forwarding_requests_share_id_fkey!inner(id, entry_id, version_id, org_id)')
    .eq('id', requestId)
    .single()
  if (rErr || !req) throw new Error('Request not found')
  if (req.status !== 'pending') throw new Error('Request already decided')

  const updatePayload: any = { status: decision, decided_at: new Date().toISOString(), decided_by: user.id }

  if (decision === 'denied') {
    const { error: uErr } = await (supabase as any)
      .from('share_forwarding_requests').update(updatePayload).eq('id', requestId)
    if (uErr) throw new Error('Failed to update: ' + uErr.message)
    revalidatePath(`/dashboard/knowledge/${req.knowledge_shares.entry_id}`)
    return {}
  }

  // approved → mint a fresh share
  const days = Math.max(1, Math.min(365, Math.floor(expiresInDays)))
  const newToken = genToken()
  const newExpires = new Date(Date.now() + days * 86400000).toISOString()

  const { data: newShare, error: sErr } = await (supabase as any)
    .from('knowledge_shares')
    .insert({
      org_id,
      entry_id: req.knowledge_shares.entry_id,
      version_id: req.knowledge_shares.version_id,
      token: newToken,
      recipient_name: req.new_recipient_name,
      recipient_email: req.new_recipient_email,
      expires_at: newExpires,
      created_by: user.id,
    })
    .select('id')
    .single()
  if (sErr) throw new Error('Failed to mint forwarded share: ' + sErr.message)

  await (supabase as any)
    .from('share_forwarding_requests')
    .update({ ...updatePayload, new_share_id: newShare.id })
    .eq('id', requestId)

  // Upsert contact for the new recipient
  await (supabase as any)
    .from('contacts')
    .upsert({
      org_id,
      full_name: req.new_recipient_name,
      email: req.new_recipient_email.toLowerCase(),
      source: 'share',
      created_by: user.id,
    }, { onConflict: 'org_id,email', ignoreDuplicates: false })

  // Send the email via Resend (non-fatal if it fails)
  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) {
    console.warn('[share-forward] RESEND_API_KEY missing; email skipped for', req.new_recipient_email)
  } else {
    try {
      const { Resend } = await import('resend')
      const resend = new Resend(resendKey)
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://hq.streichforce.com'
      const result = await resend.emails.send({
        from: 'Streich Force HQ <info@streichforce.com>',
        to: req.new_recipient_email,
        subject: `A document has been shared with you`,
        html: `<p>Hi ${req.new_recipient_name},</p>
<p>You've been granted view access to a document via Sonja HQ. The link below is unique to you and expires on ${new Date(newExpires).toLocaleDateString()}.</p>
<p><a href="${appUrl}/share/${newToken}">${appUrl}/share/${newToken}</a></p>
<p>— Sonja HQ</p>`,
      })
      if ((result as any)?.error) {
        console.error('[share-forward] Resend error:', (result as any).error)
      } else {
        console.log('[share-forward] Resend accepted; id=', (result as any)?.data?.id, 'to=', req.new_recipient_email)
      }
    } catch (e: any) {
      console.error('[share-forward] Resend threw:', e)
    }
  }

  revalidatePath(`/dashboard/knowledge/${req.knowledge_shares.entry_id}`)
  return { token: newToken, entryId: req.knowledge_shares.entry_id }
}

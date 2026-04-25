'use server'
/**
 * Contacts module — org-wide CRM seed.
 *
 * Visibility rule (resolved Sprint 10b kickoff): every member of the org sees
 * every contact in the org; `created_by` is preserved for provenance. Contacts
 * are auto-created when a knowledge share is sent (consent_to_contact = false
 * until the recipient opts in via the share viewer).
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export interface Contact {
  id: string
  org_id: string
  full_name: string
  email: string
  phone: string | null
  company: string | null
  role: string | null
  tags: string[]
  notes: string | null
  consent_to_contact: boolean
  consent_at: string | null
  source: string | null
  created_by: string
  created_at: string
  updated_at: string
}

async function getCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

export async function listContacts(query?: string): Promise<Contact[]> {
  const { supabase, org_id } = await getCtx()
  let q = (supabase as any)
    .from('contacts')
    .select('*')
    .eq('org_id', org_id)
    .order('updated_at', { ascending: false })
    .limit(500)
  const term = query?.trim()
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,company.ilike.%${term}%`)
  const { data, error } = await q
  if (error) throw new Error('Failed to list contacts: ' + error.message)
  return (data ?? []) as Contact[]
}

export async function getContact(id: string): Promise<Contact | null> {
  const { supabase, org_id } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('contacts').select('*').eq('id', id).eq('org_id', org_id).maybeSingle()
  if (error) throw new Error('Failed to load contact: ' + error.message)
  return (data ?? null) as Contact | null
}

export async function createContact(input: {
  full_name: string
  email: string
  phone?: string
  company?: string
  role?: string
  tags?: string[]
  notes?: string
}): Promise<{ id: string }> {
  const { supabase, user, org_id } = await getCtx()
  const full_name = input.full_name.trim()
  const email = input.email.trim().toLowerCase()
  if (!full_name) throw new Error('Name is required')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Valid email is required')

  const { data, error } = await (supabase as any)
    .from('contacts')
    .upsert({
      org_id,
      full_name,
      email,
      phone: input.phone?.trim() || null,
      company: input.company?.trim() || null,
      role: input.role?.trim() || null,
      tags: (input.tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 12),
      notes: input.notes?.trim() || null,
      source: 'manual',
      created_by: user.id,
    }, { onConflict: 'org_id,email', ignoreDuplicates: false })
    .select('id')
    .single()
  if (error) throw new Error('Failed to create contact: ' + error.message)
  revalidatePath('/dashboard/contacts')
  return { id: data.id as string }
}

export async function updateContact(id: string, patch: Partial<Pick<Contact,
  'full_name' | 'email' | 'phone' | 'company' | 'role' | 'tags' | 'notes' | 'consent_to_contact'
>>): Promise<void> {
  const { supabase, org_id } = await getCtx()
  const update: any = {}
  if (patch.full_name !== undefined) update.full_name = patch.full_name.trim()
  if (patch.email !== undefined) update.email = patch.email.trim().toLowerCase()
  if (patch.phone !== undefined) update.phone = patch.phone?.trim() || null
  if (patch.company !== undefined) update.company = patch.company?.trim() || null
  if (patch.role !== undefined) update.role = patch.role?.trim() || null
  if (patch.tags !== undefined) {
    update.tags = (patch.tags ?? []).map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 12)
  }
  if (patch.notes !== undefined) update.notes = patch.notes?.trim() || null
  if (patch.consent_to_contact !== undefined) {
    update.consent_to_contact = patch.consent_to_contact
    update.consent_at = patch.consent_to_contact ? new Date().toISOString() : null
  }
  const { error } = await (supabase as any)
    .from('contacts').update(update).eq('id', id).eq('org_id', org_id)
  if (error) throw new Error('Failed to update contact: ' + error.message)
  revalidatePath('/dashboard/contacts')
  revalidatePath(`/dashboard/contacts/${id}`)
}

export async function deleteContact(id: string): Promise<void> {
  const { supabase, org_id } = await getCtx()
  const { error } = await (supabase as any).from('contacts').delete().eq('id', id).eq('org_id', org_id)
  if (error) throw new Error('Failed to delete contact: ' + error.message)
  revalidatePath('/dashboard/contacts')
}

/**
 * Returns all shares + forwarding requests touching this contact's email.
 */
export async function getContactActivity(contactId: string): Promise<{
  shares: Array<{ id: string; entry_id: string; entry_title: string | null; created_at: string; expires_at: string; revoked_at: string | null }>
  forwardRequests: Array<{ id: string; share_id: string; new_recipient_email: string; status: string; created_at: string }>
}> {
  const { supabase, org_id } = await getCtx()
  const contact = await getContact(contactId)
  if (!contact) throw new Error('Contact not found')

  const [{ data: shares }, { data: forwards }] = await Promise.all([
    (supabase as any)
      .from('knowledge_shares')
      .select('id, entry_id, created_at, expires_at, revoked_at, knowledge_entries!inner(title)')
      .eq('org_id', org_id)
      .eq('recipient_email', contact.email)
      .order('created_at', { ascending: false }),
    (supabase as any)
      .from('share_forwarding_requests')
      .select('id, share_id, new_recipient_email, status, created_at')
      .eq('org_id', org_id)
      .or(`requested_by_email.eq.${contact.email},new_recipient_email.eq.${contact.email}`)
      .order('created_at', { ascending: false }),
  ])

  return {
    shares: (shares ?? []).map((s: any) => ({
      id: s.id, entry_id: s.entry_id,
      entry_title: s.knowledge_entries?.title ?? null,
      created_at: s.created_at, expires_at: s.expires_at, revoked_at: s.revoked_at,
    })),
    forwardRequests: (forwards ?? []) as any[],
  }
}

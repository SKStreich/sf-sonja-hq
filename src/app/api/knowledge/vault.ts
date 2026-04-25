'use server'
/**
 * Vault — Tier 2 surface inside the Knowledge Hub.
 *
 * Spec invariants:
 *  - Claude NEVER reads vault entry bodies or bucket objects.
 *  - Never shareable via public token.
 *  - Only owner (or explicit grantee) downloads via short-lived signed URL.
 *
 * Keep ALL vault storage access localized to this file.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

const BUCKET = 'vault'
const MAX_BYTES = 50 * 1024 * 1024
const ENTITIES = ['tm', 'sf', 'sfe', 'personal'] as const
type Entity = typeof ENTITIES[number]

export interface VaultEntry {
  id: string
  title: string | null
  mime_type: string | null
  size_bytes: number | null
  entity: Entity
  tags: string[]
  summary: string | null
  created_at: string
  user_id: string
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

export async function listVaultEntries(): Promise<VaultEntry[]> {
  const { supabase } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, title, mime_type, size_bytes, entity, tags, summary, created_at, user_id')
    .eq('access', 'vault')
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (error) throw new Error('Failed to list vault: ' + error.message)
  return (data ?? []) as VaultEntry[]
}

export async function uploadVaultFile(formData: FormData): Promise<{ id: string }> {
  const { supabase, user, org_id } = await getCtx()

  const file = formData.get('file')
  const entity = formData.get('entity')
  const note = formData.get('note')
  const tagsRaw = formData.get('tags')

  if (!(file instanceof File)) throw new Error('File is required')
  if (file.size === 0) throw new Error('File is empty')
  if (file.size > MAX_BYTES) throw new Error(`File exceeds ${MAX_BYTES / 1024 / 1024}MB limit`)
  if (typeof entity !== 'string' || !(ENTITIES as readonly string[]).includes(entity)) {
    throw new Error('Invalid entity')
  }
  const tags: string[] = typeof tagsRaw === 'string' && tagsRaw.trim()
    ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean).slice(0, 8)
    : []

  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120)
  const storage_path = `${user.id}/${crypto.randomUUID()}-${safeName}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storage_path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    })
  if (upErr) throw new Error('Upload failed: ' + upErr.message)

  const summary = typeof note === 'string' && note.trim() ? note.trim().slice(0, 500) : null

  const { data, error } = await (supabase as any)
    .from('knowledge_entries')
    .insert({
      org_id, user_id: user.id,
      kind: 'vault', access: 'vault',
      entity: entity as Entity,
      title: file.name,
      body: null,
      summary,
      tags,
      source: 'upload',
      storage_path,
      mime_type: file.type || null,
      size_bytes: file.size,
    })
    .select('id').single()

  if (error) {
    await supabase.storage.from(BUCKET).remove([storage_path]).catch(() => {})
    throw new Error('Failed to record vault file: ' + error.message)
  }

  revalidatePath('/dashboard/knowledge')
  return { id: data.id as string }
}

export async function getVaultDownloadUrl(id: string): Promise<string> {
  const { supabase, user } = await getCtx()

  const { data: entry, error } = await (supabase as any)
    .from('knowledge_entries')
    .select('storage_path, user_id, access')
    .eq('id', id)
    .maybeSingle()
  if (error || !entry) throw new Error('File not found')
  if (entry.access !== 'vault') throw new Error('Not a vault entry')

  // Owner always allowed. Grantees need a grant row. Storage RLS enforces owner;
  // grantee downloads rely on service-role signing which we don't do here.
  // For now grants are DB-level only (read access via RLS) and downloads remain
  // owner-only. Expand when grant-download flow is defined.
  if (entry.user_id !== user.id) throw new Error('Access denied')

  const { data, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(entry.storage_path, 60)
  if (signErr || !data) throw new Error('Failed to sign URL: ' + (signErr?.message ?? 'unknown'))
  return data.signedUrl
}

export async function deleteVaultEntry(id: string) {
  const { supabase } = await getCtx()

  const { data: entry, error } = await (supabase as any)
    .from('knowledge_entries')
    .select('storage_path, access')
    .eq('id', id)
    .maybeSingle()
  if (error || !entry) throw new Error('File not found')
  if (entry.access !== 'vault') throw new Error('Not a vault entry')

  if (entry.storage_path) {
    await supabase.storage.from(BUCKET).remove([entry.storage_path]).catch(() => {})
  }

  const { error: delErr } = await (supabase as any)
    .from('knowledge_entries').delete().eq('id', id)
  if (delErr) throw new Error('Failed to delete: ' + delErr.message)

  revalidatePath('/dashboard/knowledge')
}

'use server'
/**
 * Knowledge Hub — Tier-1 file upload (Server Action surface).
 *
 * Session-authed UI uploads. Extraction + storage + DB insert logic lives in
 * src/lib/knowledge/ingest.ts so the bearer-authed REST endpoint
 * (src/app/api/knowledge/upload/route.ts) can share it.
 *
 * Supported mime types:
 *   application/pdf                                                              -> pdf-parse
 *   application/vnd.openxmlformats-officedocument.wordprocessingml.document       -> mammoth
 *   application/vnd.openxmlformats-officedocument.spreadsheetml.sheet             -> xlsx (SheetJS)
 *   text/html                                                                     -> strip tags
 *   text/plain, text/markdown                                                     -> raw text
 *
 * Vault uploads live in ./vault.ts — this file is strictly Tier-1 (access='standard').
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { BUCKET, ingestKnowledgeFile, parseTags } from '@/lib/knowledge/ingest'

async function getCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

export async function uploadKnowledgeFile(form: FormData): Promise<{ id: string }> {
  const { supabase, user, org_id } = await getCtx()

  const file = form.get('file')
  const entity = String(form.get('entity') ?? '')
  const kind = String(form.get('kind') ?? 'doc')
  const tagsRaw = String(form.get('tags') ?? '')

  if (!(file instanceof File)) throw new Error('File is required')

  const result = await ingestKnowledgeFile({
    supabase,
    user_id: user.id,
    org_id,
    file,
    entity,
    kind,
    tags: parseTags(tagsRaw),
  })

  revalidatePath('/dashboard/knowledge')
  return { id: result.id }
}

export type OriginalView =
  | { kind: 'html'; html: string }
  | { kind: 'pdf'; signedUrl: string; filename: string }
  | { kind: 'text'; text: string; markdown: boolean }
  | { kind: 'none' }

/**
 * Returns the data needed to render an uploaded file in its original form.
 * - HTML / DOCX / XLSX → server-extracted rendered_html (sandboxed in client iframe).
 * - PDF → short-lived signed Storage URL.
 * - Plain text / markdown → raw body.
 */
export async function getOriginalView(entryId: string): Promise<OriginalView> {
  const { supabase } = await getCtx()
  const { data: entry, error } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, mime_type, storage_path, rendered_html, body, title')
    .eq('id', entryId)
    .maybeSingle()
  if (error || !entry) throw new Error('Entry not found')

  const mime = (entry.mime_type as string | null) ?? ''

  if (entry.rendered_html) {
    return { kind: 'html', html: entry.rendered_html as string }
  }

  if (mime === 'application/pdf' && entry.storage_path) {
    const { data: signed, error: signErr } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(entry.storage_path as string, 60 * 10)
    if (signErr || !signed) throw new Error('Could not sign PDF URL')
    return { kind: 'pdf', signedUrl: signed.signedUrl, filename: entry.title ?? 'document.pdf' }
  }

  if (mime === 'text/markdown' || mime === 'text/plain') {
    return { kind: 'text', text: entry.body ?? '', markdown: mime === 'text/markdown' }
  }

  return { kind: 'none' }
}

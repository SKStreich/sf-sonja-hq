'use server'
/**
 * Knowledge Hub — Tier-1 file upload.
 *
 * Accepts a File, uploads it to the `knowledge` Supabase Storage bucket,
 * extracts body text based on mime type, and inserts a knowledge_entries row.
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

const BUCKET = 'knowledge'
const MAX_BYTES = 25 * 1024 * 1024
const MAX_BODY_CHARS = 50_000

const ENTITIES = ['tm', 'sf', 'sfe', 'personal'] as const
type Entity = typeof ENTITIES[number]

const KINDS = ['idea', 'doc', 'chat', 'note', 'critique'] as const
type Kind = typeof KINDS[number]

const SUPPORTED_MIME = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/html',
  'text/plain',
  'text/markdown',
])

async function getCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

interface ExtractResult {
  body: string
  rendered_html: string | null
}

async function extractContent(file: File, mime: string): Promise<ExtractResult> {
  const buf = Buffer.from(await file.arrayBuffer())

  if (mime === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default as (b: Buffer) => Promise<{ text: string }>
    const res = await pdfParse(buf)
    // PDF original view served via signed Storage URL — no rendered_html needed.
    return { body: res.text ?? '', rendered_html: null }
  }

  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const mammoth = await import('mammoth')
    const [rawText, html] = await Promise.all([
      mammoth.extractRawText({ buffer: buf }),
      mammoth.convertToHtml({ buffer: buf }),
    ])
    return { body: rawText.value ?? '', rendered_html: html.value ?? null }
  }

  if (mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'buffer' })
    const parts: string[] = []
    const htmlParts: string[] = []
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name]
      if (!sheet) continue
      const csv = XLSX.utils.sheet_to_csv(sheet)
      if (csv.trim()) parts.push(`# ${name}\n${csv}`)
      const tableHtml = XLSX.utils.sheet_to_html(sheet, { header: '', footer: '' })
      htmlParts.push(`<h2>${escapeHtml(name)}</h2>${tableHtml}`)
    }
    return { body: parts.join('\n\n'), rendered_html: htmlParts.join('\n') || null }
  }

  if (mime === 'text/html') {
    const raw = buf.toString('utf8')
    return { body: stripHtml(raw), rendered_html: raw }
  }

  // text/plain, text/markdown
  return { body: buf.toString('utf8'), rendered_html: null }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export async function uploadKnowledgeFile(form: FormData): Promise<{ id: string }> {
  const { supabase, user, org_id } = await getCtx()

  const file = form.get('file')
  const entity = String(form.get('entity') ?? '')
  const kindRaw = String(form.get('kind') ?? 'doc')
  const tagsRaw = String(form.get('tags') ?? '')

  if (!(file instanceof File)) throw new Error('File is required')
  if (file.size === 0) throw new Error('File is empty')
  if (file.size > MAX_BYTES) {
    throw new Error(`File exceeds ${MAX_BYTES / 1024 / 1024}MB limit`)
  }
  if (!(ENTITIES as readonly string[]).includes(entity)) {
    throw new Error('Invalid entity')
  }

  const mime = file.type || ''
  if (!SUPPORTED_MIME.has(mime)) {
    throw new Error(
      `Unsupported file type: ${mime || 'unknown'}. Supported: PDF, DOCX, XLSX, HTML, TXT, Markdown.`,
    )
  }

  const kind: Kind = (KINDS as readonly string[]).includes(kindRaw) ? (kindRaw as Kind) : 'doc'

  const tags: string[] = tagsRaw
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8)

  // Extract body first — fail fast before occupying bucket space.
  let body = ''
  let rendered_html: string | null = null
  try {
    const extracted = await extractContent(file, mime)
    body = extracted.body
    rendered_html = extracted.rendered_html
  } catch (err: any) {
    throw new Error(`Failed to parse file: ${err?.message ?? 'unknown error'}`)
  }
  body = (body ?? '').trim().slice(0, MAX_BODY_CHARS)

  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120)
  const storage_path = `${org_id}/${user.id}/${crypto.randomUUID()}-${safeName}`

  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storage_path, file, {
      contentType: mime || 'application/octet-stream',
      upsert: false,
    })
  if (upErr) throw new Error('Upload failed: ' + upErr.message)

  const title = file.name

  const { data, error } = await (supabase as any)
    .from('knowledge_entries')
    .insert({
      org_id,
      user_id: user.id,
      kind,
      access: 'standard',
      entity,
      title,
      body: body || null,
      tags,
      source: 'upload',
      storage_path,
      mime_type: mime || null,
      size_bytes: file.size,
      rendered_html,
    })
    .select('id')
    .single()

  if (error) {
    await supabase.storage.from(BUCKET).remove([storage_path]).catch(() => {})
    throw new Error('Failed to record entry: ' + error.message)
  }

  revalidatePath('/dashboard/knowledge')
  return { id: data.id as string }
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

/**
 * Shared core for knowledge_entries ingestion. Used by:
 *   - src/app/api/knowledge/upload.ts          (Server Action — session-authed UI uploads)
 *   - src/app/api/knowledge/upload/route.ts    (REST endpoint — bearer-authed external uploads)
 *
 * Callers supply the Supabase client (session or admin) and the authenticated
 * user/org context. No auth code lives here.
 */
export const BUCKET = 'knowledge'
export const MAX_BYTES = 25 * 1024 * 1024
export const MAX_BODY_CHARS = 50_000

export const ENTITIES = ['tm', 'sf', 'sfe', 'personal'] as const
export type Entity = typeof ENTITIES[number]

export const KINDS = ['idea', 'doc', 'chat', 'note', 'critique'] as const
export type Kind = typeof KINDS[number]

export const SUPPORTED_MIME = new Set<string>([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/html',
  'text/plain',
  'text/markdown',
])

export function stripHtml(input: string): string {
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

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 8)
}

export function resolveKind(raw: string): Kind {
  return (KINDS as readonly string[]).includes(raw) ? (raw as Kind) : 'doc'
}

export function isValidEntity(entity: string): entity is Entity {
  return (ENTITIES as readonly string[]).includes(entity)
}

export interface ExtractResult {
  body: string
  rendered_html: string | null
}

export async function extractContent(file: File, mime: string): Promise<ExtractResult> {
  const buf = Buffer.from(await file.arrayBuffer())

  if (mime === 'application/pdf') {
    const pdfParse = (await import('pdf-parse')).default as (b: Buffer) => Promise<{ text: string }>
    const res = await pdfParse(buf)
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

  return { body: buf.toString('utf8'), rendered_html: null }
}

export interface IngestInput {
  // Session-authed or admin client — duck-typed (.from / .storage) to match
  // the codebase's existing `(supabase as any)` convention and avoid a
  // generic-parameter mismatch between the two client builders.
  supabase: any
  user_id: string
  org_id: string
  file: File
  entity: string
  kind: string
  tags: string[]
}

export interface IngestResult {
  id: string
  title: string
  body_chars: number
  storage_path: string
}

export class IngestValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IngestValidationError'
  }
}

/**
 * Upload a file to the knowledge bucket and insert a knowledge_entries row.
 * Throws IngestValidationError for client-input issues, plain Error for I/O failures.
 * On DB-insert failure the uploaded blob is cleaned up.
 */
export async function ingestKnowledgeFile(input: IngestInput): Promise<IngestResult> {
  const { supabase, user_id, org_id, file, entity, kind, tags } = input

  if (file.size === 0) throw new IngestValidationError('File is empty')
  if (file.size > MAX_BYTES) {
    throw new IngestValidationError(`File exceeds ${MAX_BYTES / 1024 / 1024}MB limit`)
  }
  if (!isValidEntity(entity)) {
    throw new IngestValidationError(`Invalid entity: ${entity || '(empty)'}. Allowed: ${ENTITIES.join(', ')}`)
  }
  const mime = file.type || ''
  if (!SUPPORTED_MIME.has(mime)) {
    throw new IngestValidationError(
      `Unsupported file type: ${mime || 'unknown'}. Supported: PDF, DOCX, XLSX, HTML, TXT, Markdown.`,
    )
  }
  const resolvedKind = resolveKind(kind)

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
  const storage_path = `${org_id}/${user_id}/${crypto.randomUUID()}-${safeName}`

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
      user_id,
      kind: resolvedKind,
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

  return {
    id: data.id as string,
    title,
    body_chars: body.length,
    storage_path,
  }
}

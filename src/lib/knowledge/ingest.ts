/**
 * Shared core for knowledge_entries ingestion. Used by:
 *   - src/app/api/knowledge/upload.ts          (Server Action — session-authed UI uploads)
 *   - src/app/api/knowledge/upload/route.ts    (REST endpoint — bearer-authed external uploads)
 *
 * Callers supply the Supabase client (session or admin) and the authenticated
 * user/org context. No auth code lives here.
 */
import { ENTITY_SLUGS } from '@/lib/entities/config'

export const BUCKET = 'knowledge'
export const MAX_BYTES = 25 * 1024 * 1024
export const MAX_BODY_CHARS = 50_000

export const ENTITIES = ENTITY_SLUGS
export type Entity = typeof ENTITY_SLUGS[number]

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

/** Thrown when an update targets an entry that doesn't exist or isn't owned by the caller. */
export class IngestNotFoundError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'IngestNotFoundError'
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

export interface UpdateFromFileInput {
  supabase: any
  user_id: string
  org_id: string
  entry_id: string
  file: File
  // Optional metadata overrides — applied only when provided. Absent = keep current.
  entity?: string
  kind?: string
  tags?: string[]
}

export interface UpdateFromFileResult {
  id: string
  title: string
  body_chars: number
  storage_path: string | null
  version: number
  /** true if content changed and a new version was snapshotted; false on an idempotent no-op. */
  versioned: boolean
}

/**
 * Re-mirror a file into an EXISTING knowledge entry, preserving Notion-style
 * history: the prior content is snapshotted into knowledge_versions and the
 * entry's version is bumped — mirroring updateEntry() (actions.ts). This is the
 * versioning counterpart to ingestKnowledgeFile (which always inserts a NEW row).
 *
 * Ownership is enforced by scoping the lookup to (org_id, user_id) — a caller
 * can only update their own entries even though the admin client bypasses RLS.
 *
 * If the new file's extracted content matches the current entry, this is an
 * idempotent no-op (no version, no storage churn) — same "don't snapshot
 * unchanged content" rule as updateEntry.
 */
export async function updateKnowledgeEntryFromFile(input: UpdateFromFileInput): Promise<UpdateFromFileResult> {
  const { supabase, user_id, org_id, entry_id, file } = input

  if (file.size === 0) throw new IngestValidationError('File is empty')
  if (file.size > MAX_BYTES) {
    throw new IngestValidationError(`File exceeds ${MAX_BYTES / 1024 / 1024}MB limit`)
  }
  const mime = file.type || ''
  if (!SUPPORTED_MIME.has(mime)) {
    throw new IngestValidationError(
      `Unsupported file type: ${mime || 'unknown'}. Supported: PDF, DOCX, XLSX, HTML, TXT, Markdown.`,
    )
  }
  if (input.entity !== undefined && !isValidEntity(input.entity)) {
    throw new IngestValidationError(`Invalid entity: ${input.entity || '(empty)'}. Allowed: ${ENTITIES.join(', ')}`)
  }

  // Fetch the current entry, scoped to the caller for ownership enforcement.
  const { data: current, error: fetchErr } = await (supabase as any)
    .from('knowledge_entries')
    .select('id, version, title, body, kind, entity, tags, summary, type_hint, idea_status, storage_path')
    .eq('id', entry_id)
    .eq('org_id', org_id)
    .eq('user_id', user_id)
    .maybeSingle()
  if (fetchErr) throw new Error('Entry lookup failed: ' + fetchErr.message)
  if (!current) throw new IngestNotFoundError('Entry not found or not owned by caller')

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

  const title = file.name
  const nextKind = input.kind !== undefined ? resolveKind(input.kind) : current.kind
  const nextEntity = input.entity !== undefined ? input.entity : current.entity
  const nextTags = input.tags !== undefined ? input.tags : current.tags

  // Change detection mirrors updateEntry: compare the text body + metadata.
  // (rendered_html isn't part of the versions snapshot, same as updateEntry, so
  // a markup-only change with identical text is treated as a no-op.)
  const norm = (v: any) => JSON.stringify(v ?? null)
  const contentChanged =
    norm(body || null) !== norm(current.body) ||
    norm(title) !== norm(current.title) ||
    norm(nextKind) !== norm(current.kind) ||
    norm(nextEntity) !== norm(current.entity) ||
    norm(nextTags) !== norm(current.tags)

  if (!contentChanged) {
    return {
      id: entry_id,
      title: current.title ?? title,
      body_chars: (current.body ?? '').length,
      storage_path: current.storage_path ?? null,
      version: current.version,
      versioned: false,
    }
  }

  // Upload the new blob first (so a storage failure aborts before any DB write).
  const safeName = file.name.replace(/[^\w.\-]+/g, '_').slice(0, 120)
  const storage_path = `${org_id}/${user_id}/${crypto.randomUUID()}-${safeName}`
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storage_path, file, { contentType: mime || 'application/octet-stream', upsert: false })
  if (upErr) throw new Error('Upload failed: ' + upErr.message)

  // Snapshot the prior content into knowledge_versions, then bump the entry.
  const { error: versErr } = await (supabase as any)
    .from('knowledge_versions')
    .insert({
      entry_id,
      version: current.version,
      title: current.title,
      body: current.body,
      kind: current.kind,
      entity: current.entity,
      tags: current.tags,
      summary: current.summary,
      type_hint: current.type_hint,
      idea_status: current.idea_status,
      created_by: user_id,
    })
  if (versErr) {
    await supabase.storage.from(BUCKET).remove([storage_path]).catch(() => {})
    throw new Error('Failed to snapshot version: ' + versErr.message)
  }

  const { error: updErr } = await (supabase as any)
    .from('knowledge_entries')
    .update({
      title,
      body: body || null,
      rendered_html,
      kind: nextKind,
      entity: nextEntity,
      tags: nextTags,
      storage_path,
      mime_type: mime || null,
      size_bytes: file.size,
      version: current.version + 1,
    })
    .eq('id', entry_id)
  if (updErr) {
    await supabase.storage.from(BUCKET).remove([storage_path]).catch(() => {})
    throw new Error('Failed to update entry: ' + updErr.message)
  }

  // Best-effort cleanup of the superseded blob (versions store text, not blobs).
  if (current.storage_path && current.storage_path !== storage_path) {
    await supabase.storage.from(BUCKET).remove([current.storage_path]).catch(() => {})
  }

  return {
    id: entry_id,
    title,
    body_chars: body.length,
    storage_path,
    version: current.version + 1,
    versioned: true,
  }
}

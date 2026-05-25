/**
 * Knowledge Hub — programmatic upload endpoint (Action 11).
 *
 * Bearer-authenticated POST handler that mirrors uploadKnowledgeFile but
 * works from outside the HQ UI: CLI scripts, GitHub Actions, manual curl.
 *
 * Auth pattern mirrors /api/siri/route.ts:
 *   Authorization: Bearer <user_profiles.upload_api_key>
 *
 * The token is per-user, separate from capture_api_key (independent blast
 * radius). Service role bypasses RLS — user_id/org_id are set explicitly
 * from the lookup so multi-tenant isolation still holds.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  ENTITIES,
  IngestValidationError,
  ingestKnowledgeFile,
  parseTags,
} from '@/lib/knowledge/ingest'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function extractBearer(header: string | null): string | null {
  if (!header || !header.startsWith('Bearer ')) return null
  const token = header.slice(7).trim()
  return token || null
}

export async function POST(req: NextRequest) {
  const apiKey = extractBearer(req.headers.get('authorization'))
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Missing or malformed Authorization header. Expected `Bearer <upload_api_key>`.' },
      { status: 401 },
    )
  }

  const supabase = createAdminClient()

  const { data: profile, error: profileErr } = await (supabase as any)
    .from('user_profiles')
    .select('id, org_id')
    .eq('upload_api_key', apiKey)
    .maybeSingle() as { data: { id: string; org_id: string } | null; error: any }

  if (profileErr) {
    console.error('[api/knowledge/upload] profile lookup failed:', profileErr)
    return NextResponse.json({ error: 'Auth lookup failed' }, { status: 500 })
  }
  if (!profile) {
    return NextResponse.json({ error: 'Invalid upload_api_key' }, { status: 401 })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json(
      { error: 'Request body must be multipart/form-data' },
      { status: 400 },
    )
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: '`file` field is required' }, { status: 400 })
  }
  const entity = String(form.get('entity') ?? '')
  const kind = String(form.get('kind') ?? 'doc')
  const tagsRaw = String(form.get('tags') ?? '')

  try {
    const result = await ingestKnowledgeFile({
      supabase,
      user_id: profile.id,
      org_id: profile.org_id,
      file,
      entity,
      kind,
      tags: parseTags(tagsRaw),
    })
    revalidatePath('/dashboard/knowledge')
    return NextResponse.json(
      {
        id: result.id,
        title: result.title,
        body_chars: result.body_chars,
        storage_path: result.storage_path,
        url: `/dashboard/knowledge/${result.id}`,
      },
      { status: 201 },
    )
  } catch (err: any) {
    if (err instanceof IngestValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[api/knowledge/upload] ingest failed:', err)
    return NextResponse.json({ error: err?.message ?? 'Ingestion failed' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    status: 'Sonja HQ knowledge upload endpoint active',
    method: 'POST',
    auth: 'Authorization: Bearer <upload_api_key>',
    body: {
      contentType: 'multipart/form-data',
      fields: {
        file: 'required — the file to ingest',
        entity: `required — one of: ${ENTITIES.join(', ')}`,
        kind: 'optional — default doc (idea | doc | chat | note | critique)',
        tags: 'optional — comma-separated, max 8',
      },
    },
  })
}

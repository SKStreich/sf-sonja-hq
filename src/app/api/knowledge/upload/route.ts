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
  IngestNotFoundError,
  IngestValidationError,
  ingestKnowledgeFile,
  parseTags,
  updateKnowledgeEntryFromFile,
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

  // Optional: re-mirror into an EXISTING entry, versioning it (Notion-style
  // history) instead of creating a duplicate. Accepts `entry_id` as a form
  // field or `?entry_id=` query param.
  const entryId = (
    (form.get('entry_id') != null ? String(form.get('entry_id')) : '') ||
    (req.nextUrl.searchParams.get('entry_id') ?? '')
  ).trim()

  if (entryId) {
    try {
      const result = await updateKnowledgeEntryFromFile({
        supabase,
        user_id: profile.id,
        org_id: profile.org_id,
        entry_id: entryId,
        file,
        // Metadata overrides apply only when sent — absent fields keep current.
        entity: form.get('entity') != null ? String(form.get('entity')) : undefined,
        kind: form.get('kind') != null ? String(form.get('kind')) : undefined,
        tags: form.get('tags') != null ? parseTags(String(form.get('tags'))) : undefined,
      })
      revalidatePath('/dashboard/knowledge')
      revalidatePath(`/dashboard/knowledge/${entryId}`)
      return NextResponse.json(
        {
          id: result.id,
          title: result.title,
          body_chars: result.body_chars,
          storage_path: result.storage_path,
          version: result.version,
          versioned: result.versioned,
          url: `/dashboard/knowledge/${result.id}`,
        },
        { status: 200 },
      )
    } catch (err: any) {
      if (err instanceof IngestNotFoundError) {
        return NextResponse.json({ error: err.message }, { status: 404 })
      }
      if (err instanceof IngestValidationError) {
        return NextResponse.json({ error: err.message }, { status: 400 })
      }
      console.error('[api/knowledge/upload] versioned update failed:', err)
      return NextResponse.json({ error: err?.message ?? 'Update failed' }, { status: 500 })
    }
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
        entity: `required for new entries — one of: ${ENTITIES.join(', ')}`,
        kind: 'optional — default doc (idea | doc | chat | note | critique)',
        tags: 'optional — comma-separated, max 8',
        entry_id: 'optional — if set (form field or ?entry_id= query), updates + versions that existing entry instead of creating a new one. entity/kind/tags become optional overrides; absent fields keep current. Returns 200 with {version, versioned}; 404 if not found/owned.',
      },
    },
  })
}

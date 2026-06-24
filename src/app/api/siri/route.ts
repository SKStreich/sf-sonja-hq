import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAnthropicApiKey } from '@/lib/anthropic-key'
import { classifyEntry } from '@/lib/knowledge/classify'
import { insertInboxEntry } from '@/lib/knowledge/inbox-create'
import { ENTITY_SLUGS } from '@/lib/entities/config'

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') ?? ''
    const apiKey = authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null

    if (!apiKey) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const text: string = (body.text ?? '').trim()
    // 'idea' captures become idea entries; everything else lands as a note.
    const kind = body.type === 'idea' ? 'idea' : 'note'

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: profile } = await (supabase as any)
      .from('user_profiles')
      .select('id, org_id')
      .eq('capture_api_key', apiKey)
      .single() as { data: { id: string; org_id: string } | null }

    if (!profile) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    // Quick captures land in the triage inbox with no forced entity (D2). The AI
    // guesses an entity (or honor an explicit entity_context) for the triage UI
    // to pre-select (D6); the human files it from there.
    const c = await classifyEntry(text.slice(0, 2000), { apiKey: getAnthropicApiKey() })
    const hinted = typeof body.entity_context === 'string' ? body.entity_context.trim().toLowerCase() : null
    const suggestedEntity = (hinted && (ENTITY_SLUGS as readonly string[]).includes(hinted))
      ? hinted
      : c.suggested_entity

    try {
      const { id } = await insertInboxEntry(supabase, profile.id, profile.org_id, {
        body: text.slice(0, 2000),
        kind,
        title: c.title,
        summary: c.summary,
        typeHint: c.type_hint,
        tags: c.tags,
        suggestedEntity,
        source: 'siri',
      })
      return NextResponse.json({ success: true, id })
    } catch {
      return NextResponse.json({ error: 'Failed to save capture' }, { status: 500 })
    }
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Sonja HQ capture endpoint active' })
}

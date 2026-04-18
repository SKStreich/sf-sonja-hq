import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

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
    const type: string = body.type === 'idea' ? 'idea' : 'task'

    if (!text) {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('id')
      .eq('capture_api_key', apiKey)
      .single()

    if (!profile) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 })
    }

    const { data: capture, error } = await supabase
      .from('captures')
      .insert({
        user_id: profile.id,
        type,
        content: text.slice(0, 2000),
        entity_context: body.entity_context ?? null,
        reviewed: false,
        resolved: false,
      })
      .select('id')
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to save capture' }, { status: 500 })
    }

    return NextResponse.json({ success: true, id: capture.id })
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ status: 'Sonja HQ capture endpoint active' })
}

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === 'sk-placeholder') {
    return NextResponse.json({ error: 'OpenAI API key not configured' }, { status: 503 })
  }

  try {
    const formData = await req.formData()
    const audio = formData.get('audio') as Blob | null
    if (!audio) return NextResponse.json({ error: 'No audio provided' }, { status: 400 })

    const whisperForm = new FormData()
    whisperForm.append('file', audio, 'audio.webm')
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('language', 'en')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: whisperForm,
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: 'Whisper error: ' + err }, { status: 500 })
    }

    const json = await res.json()

    // Auto-log usage cost
    try {
      const { data: profile } = await (supabase as any).from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }
      if (profile?.org_id) {
        const { logWhisperCall } = await import('@/app/api/usage/actions')
        await logWhisperCall(profile.org_id)
      }
    } catch {}

    return NextResponse.json({ text: json.text ?? '' })
  } catch (e) {
    return NextResponse.json({ error: 'Transcription failed' }, { status: 500 })
  }
}

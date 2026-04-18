'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface CapturePayload { type: 'idea' | 'task'; content: string; entity_context: string | null }

export async function submitCapture(payload: CapturePayload) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { error } = await supabase.from('captures').insert({
    user_id: user.id,
    type: payload.type,
    content: payload.content,
    entity_context: payload.entity_context,
    reviewed: false,
  })

  if (error) throw new Error('Failed to save capture')
  revalidatePath('/dashboard')
}

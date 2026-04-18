'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

interface FocusPayload { content: string; userId: string }

export async function setFocusNote({ content, userId }: FocusPayload) {
  const supabase = createClient()

  await supabase
    .from('focus_notes')
    .update({ archived: true })
    .eq('user_id', userId)
    .eq('archived', false)

  const { error } = await supabase.from('focus_notes').insert({
    user_id: userId,
    content: content.trim(),
    archived: false,
  })

  if (error) {
    console.error('[setFocusNote] Supabase error:', JSON.stringify(error))
    throw new Error('Failed to save focus note')
  }
  revalidatePath('/dashboard')
}

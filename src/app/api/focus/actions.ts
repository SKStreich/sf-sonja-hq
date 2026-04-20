'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function setFocusNote({ content }: { content: string }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  await (supabase as any)
    .from('focus_notes')
    .update({ archived: true })
    .eq('user_id', user.id)
    .eq('archived', false)

  const { error } = await (supabase as any).from('focus_notes').insert({
    user_id: user.id,
    content: content.trim(),
    archived: false,
  })

  if (error) throw new Error('Failed to save focus note')
  revalidatePath('/dashboard')
}

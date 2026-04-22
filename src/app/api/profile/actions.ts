'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function updateProfileName(fullName: string) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const trimmed = fullName.trim()
  if (!trimmed) throw new Error('Name cannot be empty')
  const { error } = await (supabase as any)
    .from('user_profiles')
    .update({ full_name: trimmed })
    .eq('id', user.id)
  if (error) throw new Error('Failed to update name')
  revalidatePath('/dashboard/profile')
  revalidatePath('/dashboard')
}

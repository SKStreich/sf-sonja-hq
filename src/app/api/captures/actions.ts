'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export async function regenerateCaptureKey() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()
  const { data } = await admin.rpc('gen_random_uuid' as any)
  const newKey = data ?? crypto.randomUUID()

  const { error: updateError } = await admin
    .from('user_profiles')
    .update({ capture_api_key: newKey } as any)
    .eq('id', user.id)

  if (updateError) throw new Error('Failed to regenerate key')
  revalidatePath('/dashboard/settings')
  return newKey
}

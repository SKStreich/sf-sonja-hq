'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export async function markCaptureReviewed(id: string) {
  const supabase = createClient()
  await (supabase as any).from('captures').update({ reviewed: true }).eq('id', id)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/captures')
}

export async function deleteCapture(id: string) {
  const supabase = createClient()
  await (supabase as any).from('captures').delete().eq('id', id)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/captures')
}

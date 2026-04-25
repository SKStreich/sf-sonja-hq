'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getOrgId() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, org_id: profile.org_id as string }
}

export async function linkProjectToNotion(projectId: string, notionUrl: string | null) {
  const { supabase } = await getOrgId()
  const { error } = await (supabase as any)
    .from('projects')
    .update({ notion_url: notionUrl })
    .eq('id', projectId)
  if (error) throw new Error('Failed to save Notion link')
  revalidatePath(`/dashboard/projects/${projectId}`)
}

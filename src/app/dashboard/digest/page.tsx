import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getInsights } from '@/app/api/digest/actions'
import { DigestClient } from './DigestClient'

export default async function DigestPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const insights = await getInsights()

  return (
    <DigestClient
      insights={insights}
      anthropicConfigured={!!process.env.ANTHROPIC_API_KEY}
    />
  )
}

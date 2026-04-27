import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CostDashboard } from '@/components/cost/CostDashboard'
import { getServiceConfigs, getLastSyncTimestamp } from '@/app/api/usage/actions'

export default async function CostPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await (supabase as any)
    .from('user_profiles')
    .select('role, org_id')
    .eq('id', user.id)
    .single()
  if (profile?.role === 'member' || profile?.role === 'read_only') redirect('/dashboard/profile')

  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const [{ data: usage }, serviceConfigs, lastSync] = await Promise.all([
    (supabase as any)
      .from('resource_usage')
      .select('*')
      .gte('period_start', ninetyDaysAgo.toISOString().slice(0, 10))
      .order('period_start', { ascending: false }),
    getServiceConfigs(),
    getLastSyncTimestamp(),
  ])

  const serviceConfig = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-placeholder',
    resend: !!process.env.RESEND_API_KEY,
    vercel: !!process.env.VERCEL_TOKEN,
    netlify: !!process.env.NETLIFY_AUTH_TOKEN && !!process.env.NETLIFY_ACCOUNT_SLUG,
    supabase: true, // always available — no API key needed
  }

  return (
    <CostDashboard
      usage={usage ?? []}
      serviceConfig={serviceConfig}
      serviceConfigs={serviceConfigs}
      lastSync={lastSync}
    />
  )
}

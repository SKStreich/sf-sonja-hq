import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { CostDashboard } from '@/components/cost/CostDashboard'

export default async function CostPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Last 90 days of usage
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: usage } = await (supabase as any)
    .from('resource_usage')
    .select('*')
    .gte('period_start', ninetyDaysAgo.toISOString().slice(0, 10))
    .order('period_start', { ascending: false })

  const serviceConfig = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== 'sk-placeholder',
    resend: !!process.env.RESEND_API_KEY,
    vercel: !!process.env.VERCEL_TOKEN,
    netlify: !!process.env.NETLIFY_AUTH_TOKEN && !!process.env.NETLIFY_ACCOUNT_SLUG,
  }

  return <CostDashboard usage={usage ?? []} serviceConfig={serviceConfig} />
}

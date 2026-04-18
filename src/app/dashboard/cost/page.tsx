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

  return <CostDashboard usage={usage ?? []} />
}

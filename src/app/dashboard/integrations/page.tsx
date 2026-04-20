import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getIntegrationStatuses } from '@/app/api/integrations/actions'
import { IntegrationsHub } from '@/components/integrations/IntegrationsHub'

export default async function IntegrationsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const integrations = await getIntegrationStatuses()

  return <IntegrationsHub integrations={integrations} />
}

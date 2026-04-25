import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { listEntries, getHubMetrics } from '@/app/api/knowledge/actions'
import { listVaultEntries } from '@/app/api/knowledge/vault'
import { KnowledgeHub } from './KnowledgeHub'

export const dynamic = 'force-dynamic'

export default async function KnowledgePage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [entries, vault, metrics] = await Promise.all([
    listEntries({ limit: 200 }),
    listVaultEntries(),
    getHubMetrics(),
  ])

  return <KnowledgeHub initialEntries={entries} initialVault={vault} metrics={metrics} />
}

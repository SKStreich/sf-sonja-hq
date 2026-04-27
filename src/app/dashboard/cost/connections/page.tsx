import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServiceConfigs } from '@/app/api/usage/actions'
import { ConnectionsClient } from './ConnectionsClient'

export const dynamic = 'force-dynamic'

export default async function ConnectionsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const configs = await getServiceConfigs()
  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link href="/dashboard/cost" className="text-xs uppercase tracking-wider text-gray-500 hover:text-gray-700">← Cost &amp; Usage</Link>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">Connections</h1>
          <p className="mt-1 text-sm text-gray-500">
            Each row tracks one external service. Set the monthly subscription fee so MTD totals
            include it, and point at the env var that holds the API key for live usage syncs.
          </p>
        </div>
      </div>
      <ConnectionsClient initial={configs} />
    </div>
  )
}

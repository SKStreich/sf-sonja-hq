import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CapturesClient } from './CapturesClient'

export default async function CapturesPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: captures } = await (supabase as any)
    .from('captures')
    .select('*')
    .order('created_at', { ascending: false })

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Captures Inbox</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {(captures ?? []).filter((c: any) => !c.reviewed).length} unreviewed
          </p>
        </div>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-300">← Dashboard</Link>
      </div>
      <CapturesClient initialCaptures={captures ?? []} />
    </div>
  )
}

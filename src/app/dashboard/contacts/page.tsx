import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listContacts } from '@/app/api/contacts/actions'
import { ContactsClient } from './ContactsClient'

export const dynamic = 'force-dynamic'

export default async function ContactsPage() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const contacts = await listContacts()
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
          <p className="mt-1 text-sm text-gray-500">
            Your personal address book for share targets and follow-ups. Add by hand or capture from the share flow.
            <Link href="/dashboard" className="ml-2 text-indigo-600 hover:text-indigo-500">← Dashboard</Link>
          </p>
        </div>
      </div>
      <ContactsClient initial={contacts} />
    </div>
  )
}

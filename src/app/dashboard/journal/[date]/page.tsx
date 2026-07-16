import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isValidJournalDate, todayJournalDate } from '@/lib/journal/dates'
import { getJournalDay } from '@/app/api/journal/actions'
import { JournalClient } from '../JournalClient'

export const dynamic = 'force-dynamic'

export default async function JournalDayPage({ params }: { params: { date: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { date } = params
  if (!isValidJournalDate(date)) redirect(`/dashboard/journal/${todayJournalDate()}`)

  const day = await getJournalDay(date)
  return (
    <JournalClient
      date={date}
      today={todayJournalDate()}
      initialBody={day?.body ?? ''}
    />
  )
}

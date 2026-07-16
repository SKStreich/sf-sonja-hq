import { redirect } from 'next/navigation'
import { todayJournalDate } from '@/lib/journal/dates'

export const dynamic = 'force-dynamic'

// /dashboard/journal is always "today" (spec D5) — today in America/Chicago
// (D6), resolved at request time so the nav link never goes stale.
export default function JournalTodayPage() {
  redirect(`/dashboard/journal/${todayJournalDate()}`)
}

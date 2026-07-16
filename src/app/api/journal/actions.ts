'use server'
import { createClient } from '@/lib/supabase/server'
import { isValidJournalDate } from '@/lib/journal/dates'

/**
 * Daily Journal server actions (Sprint 14 J1).
 * Spec: docs/specs/hq_journal_v1.html. journal_days is one row per user per
 * day under OWNER-ONLY RLS (OQ-1) — these actions still filter by user_id
 * explicitly so intent is visible in code, not only in the policy.
 */

export interface JournalDay {
  id: string
  entry_date: string
  body: string
  updated_at: string
}

export async function getJournalDay(date: string): Promise<JournalDay | null> {
  if (!isValidJournalDate(date)) throw new Error('Invalid journal date')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data, error } = await (supabase as any)
    .from('journal_days')
    .select('id, entry_date, body, updated_at')
    .eq('user_id', user.id)
    .eq('entry_date', date)
    .maybeSingle() as { data: JournalDay | null; error: { message: string } | null }
  if (error) throw new Error(error.message)
  return data
}

export async function saveJournalDay(date: string, body: string): Promise<JournalDay> {
  if (!isValidJournalDate(date)) throw new Error('Invalid journal date')
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }
  if (!profile) throw new Error('No profile')

  const { data, error } = await (supabase as any)
    .from('journal_days')
    .upsert(
      { org_id: profile.org_id, user_id: user.id, entry_date: date, body },
      { onConflict: 'org_id,user_id,entry_date' }
    )
    .select('id, entry_date, body, updated_at')
    .single() as { data: JournalDay | null; error: { message: string } | null }
  if (error) throw new Error(error.message)
  if (!data) throw new Error('Save failed')
  return data
}

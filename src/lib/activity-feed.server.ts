import { createClient } from '@/lib/supabase/server'
import { ACTIVITY_PAGE_SIZE, type ActivityRow } from '@/lib/activity-feed'

export async function loadInitialActivity(): Promise<{
  rows: ActivityRow[]
  nextCursor: string | null
}> {
  const supabase = createClient()
  const { data, error } = await (supabase as any).rpc('get_recent_activity', {
    before_cursor: new Date().toISOString(),
    page_size: ACTIVITY_PAGE_SIZE,
  })
  if (error) throw error
  const rows = (data ?? []) as ActivityRow[]
  const hasMore = rows.length > ACTIVITY_PAGE_SIZE
  return {
    rows: hasMore ? rows.slice(0, ACTIVITY_PAGE_SIZE) : rows,
    nextCursor: hasMore ? rows[ACTIVITY_PAGE_SIZE - 1].occurred_at : null,
  }
}

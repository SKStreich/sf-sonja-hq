'use server'

import { createClient } from '@/lib/supabase/server'
import type { ActivityRow } from '@/lib/activity-feed'

const PAGE_SIZE = 20

export async function loadMoreActivity(
  beforeCursor: string,
): Promise<{ rows: ActivityRow[]; nextCursor: string | null }> {
  const supabase = createClient()
  const { data, error } = await (supabase as any).rpc('get_recent_activity', {
    before_cursor: beforeCursor,
    page_size: PAGE_SIZE,
  })
  if (error) throw error
  const rows = (data ?? []) as ActivityRow[]
  const hasMore = rows.length > PAGE_SIZE
  return {
    rows: hasMore ? rows.slice(0, PAGE_SIZE) : rows,
    nextCursor: hasMore ? rows[PAGE_SIZE - 1].occurred_at : null,
  }
}

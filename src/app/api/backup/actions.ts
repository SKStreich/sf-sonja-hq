'use server'
/**
 * Read-only accessors for backup_state. The cron route writes via the admin
 * client; user-facing pages call this to render the "last backup" panel on
 * the Connections page.
 */
import { createClient } from '@/lib/supabase/server'

export interface BackupStateRow {
  bucket_name: string
  last_run_started_at: string | null
  last_run_completed_at: string | null
  last_run_status: 'success' | 'partial' | 'error' | null
  last_run_error: string | null
  objects_synced_total: number
  objects_synced_last_run: number
  objects_skipped_last_run: number
  bytes_synced_last_run: number
  updated_at: string
  /** Cron-specific bag — currently only used by the db-dump row. */
  last_run_details: DbDumpDetails | null
}

export interface DbDumpDetails {
  dump_key: string | null
  tables: number
  rows: number
  per_table: Record<string, number>
  retention: {
    kept: number
    pruned: number
    pruned_keys: string[]
    policy: { daily: number; weekly: number; monthly: number }
  }
}

export async function listBackupState(): Promise<BackupStateRow[]> {
  const supabase = createClient()
  const { data, error } = await (supabase as any)
    .from('backup_state')
    .select('*')
    .order('bucket_name')
  if (error) throw new Error('Failed to load backup state: ' + error.message)
  return (data ?? []) as BackupStateRow[]
}

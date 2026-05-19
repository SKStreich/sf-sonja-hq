/**
 * Vercel Cron handler for daily Postgres dump → Cloudflare R2.
 *
 * Scheduled by vercel.json at 05:00 UTC (1 hour after the bucket-backup
 * cron so they don't fight for the 5-minute compute ceiling).
 *
 * Each run:
 *   1. Dumps every public table to a single gzipped JSONL blob.
 *   2. Uploads to R2 at `db-dumps/daily/{YYYY-MM-DD}.jsonl.gz`.
 *   3. Lists existing dump objects and applies the 30/12/24 retention
 *      policy, deleting anything that doesn't fit a slot.
 *   4. Writes the outcome to `backup_state` (bucket_name='db-dump') so the
 *      Connections page can render last-run / retention stats.
 *
 * Auth: same pattern as /api/cron/backup-buckets — Vercel sets
 * `Authorization: Bearer ${CRON_SECRET}` automatically; we 401 anyone else.
 *
 * If R2 env vars are missing, 503 cleanly (matches the bucket cron's
 * behaviour). The DB-dump path doesn't need VAULT_BACKUP_KEY because the
 * JSONL dump contains zero vault file content — vault uploads live in
 * Storage (mirrored by the bucket cron) and only their metadata rows
 * appear here.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isR2Configured, r2Put, r2List, r2Delete } from '@/lib/r2/client'
import { dumpAllTables } from '@/lib/backup/db-dump'
import { applyRetention, DEFAULT_POLICY } from '@/lib/backup/db-dump-retention'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

const BUCKET_KEY = 'db-dump'
const KEY_PREFIX = 'db-dumps/daily/'

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  if (!secret) {
    console.error('[cron/db-dump] CRON_SECRET not configured; refusing.')
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isR2Configured()) {
    console.error('[cron/db-dump] R2 env vars not set; refusing.')
    return NextResponse.json({ error: 'r2 not configured' }, { status: 503 })
  }

  const startedAt = new Date()
  const supabase = createAdminClient()
  await (supabase as any).from('backup_state').upsert({
    bucket_name: BUCKET_KEY,
    last_run_started_at: startedAt.toISOString(),
  }, { onConflict: 'bucket_name' })

  let dumpKey = ''
  let dumpBytes = 0
  let totalRows = 0
  let tablesDumped = 0
  let retentionKept = 0
  let retentionPruned = 0
  let prunedKeys: string[] = []
  let errorMsg: string | null = null
  let perTable: Record<string, number> = {}

  try {
    const dump = await dumpAllTables(supabase)
    tablesDumped = dump.tables.length
    totalRows = dump.totalRows
    perTable = dump.perTable
    dumpBytes = dump.gzipped.byteLength

    // Date-stamp in UTC so a cron firing just before midnight UTC still
    // lands the dump under "today" — and so two runs in one UTC day
    // overwrite each other rather than splitting across two slots.
    const dateStamp = dump.takenAt.slice(0, 10)
    dumpKey = `${KEY_PREFIX}${dateStamp}.jsonl.gz`
    await r2Put(dumpKey, dump.gzipped, {
      contentType: 'application/gzip',
      metadata: {
        'src-bucket': 'db-dump',
        'taken-at': dump.takenAt,
        'schema-version': dump.schemaVersion ?? 'unknown',
        'tables': String(tablesDumped),
        'rows': String(totalRows),
      },
    })

    // Retention pass — list current dumps, decide what to prune, delete.
    const existing = await r2List(KEY_PREFIX)
    const plan = applyRetention(existing.map(o => o.key), DEFAULT_POLICY)
    retentionKept = plan.keep.length
    prunedKeys = plan.prune
    retentionPruned = prunedKeys.length
    for (const key of prunedKeys) {
      // Belt-and-braces: never delete today's dump even if a malformed
      // policy somehow marks it for prune.
      if (key === dumpKey) continue
      await r2Delete(key)
    }
  } catch (e: any) {
    errorMsg = e?.message ?? 'db-dump cron failed'
    console.error('[cron/db-dump] fatal:', e)
  }

  const status: 'success' | 'error' =
    errorMsg ? 'error' : 'success'

  await (supabase as any).from('backup_state').update({
    last_run_completed_at: new Date().toISOString(),
    last_run_status: status,
    last_run_error: errorMsg,
    objects_synced_last_run: errorMsg ? 0 : 1,
    objects_skipped_last_run: 0,
    bytes_synced_last_run: dumpBytes,
    last_run_details: {
      dump_key: dumpKey || null,
      tables: tablesDumped,
      rows: totalRows,
      per_table: perTable,
      retention: {
        kept: retentionKept,
        pruned: retentionPruned,
        pruned_keys: prunedKeys,
        policy: DEFAULT_POLICY,
      },
    },
    updated_at: new Date().toISOString(),
  }).eq('bucket_name', BUCKET_KEY)

  if (!errorMsg) {
    const { data } = await (supabase as any)
      .from('backup_state').select('objects_synced_total')
      .eq('bucket_name', BUCKET_KEY).maybeSingle()
    const current = (data?.objects_synced_total as number) ?? 0
    await (supabase as any).from('backup_state')
      .update({ objects_synced_total: current + 1 })
      .eq('bucket_name', BUCKET_KEY)
  }

  return NextResponse.json({
    ok: !errorMsg,
    dump_key: dumpKey,
    bytes: dumpBytes,
    tables: tablesDumped,
    rows: totalRows,
    retention: { kept: retentionKept, pruned: retentionPruned },
    error: errorMsg,
  })
}

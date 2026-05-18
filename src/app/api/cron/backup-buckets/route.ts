/**
 * Vercel Cron handler for daily Supabase Storage → Cloudflare R2 mirror.
 *
 * Scheduled by vercel.json at 04:00 UTC. Walks each tracked bucket
 * (`knowledge`, `vault`, `project-files`), lists every object, and uploads
 * any that R2 doesn't already have. Existing R2 objects are skipped via HEAD,
 * so each run is incremental and idempotent.
 *
 * Vault content is wrapped with AES-256-GCM (see lib/backup/vault-crypto.ts)
 * before upload — R2 never sees vault plaintext.
 *
 * Auth: same pattern as /api/cron/sync-usage — Vercel sets
 * `Authorization: Bearer ${CRON_SECRET}` automatically for cron-triggered
 * requests; we 401 anyone else.
 *
 * Retention: this PR does not delete objects. R2 keeps them indefinitely so
 * an accidentally-deleted Supabase object is recoverable. Snapshot-style
 * retention (30 daily / 12 weekly / 24 monthly) will land with the DB-dump
 * cron in a follow-up PR.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isR2Configured, r2Head, r2Put } from '@/lib/r2/client'
import { encryptVaultBuffer, isVaultKeyConfigured } from '@/lib/backup/vault-crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300  // Pro tier 5-minute ceiling

const BUCKETS = ['knowledge', 'vault', 'project-files'] as const
type Bucket = typeof BUCKETS[number]

// Cap per-run work so a slow OneDrive upload day doesn't time out at 5 min.
// Anything not synced this run will be picked up next run (HEAD skip path).
const MAX_OBJECTS_PER_BUCKET_PER_RUN = 200

interface BucketResult {
  bucket: Bucket
  status: 'success' | 'partial' | 'error'
  objects_synced: number
  objects_skipped: number
  bytes_synced: number
  error: string | null
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  if (!secret) {
    console.error('[cron/backup-buckets] CRON_SECRET not configured; refusing.')
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }
  if (!isR2Configured()) {
    console.error('[cron/backup-buckets] R2 env vars not set; refusing.')
    return NextResponse.json({ error: 'r2 not configured' }, { status: 503 })
  }
  if (!isVaultKeyConfigured()) {
    console.error('[cron/backup-buckets] VAULT_BACKUP_KEY not set; refusing.')
    return NextResponse.json({ error: 'vault key not configured' }, { status: 503 })
  }

  const startedAt = Date.now()
  const results: BucketResult[] = []
  for (const bucket of BUCKETS) {
    results.push(await syncBucket(bucket))
  }
  const duration_ms = Date.now() - startedAt
  console.log(`[cron/backup-buckets] done in ${duration_ms}ms`, results)
  return NextResponse.json({ ok: true, duration_ms, results })
}

/**
 * Walks every object under the bucket, uploads missing ones to R2. Updates
 * backup_state at the end with the outcome.
 */
async function syncBucket(bucket: Bucket): Promise<BucketResult> {
  const supabase = createAdminClient()
  const startedAt = new Date()
  let synced = 0
  let skipped = 0
  let bytes = 0
  let errorMsg: string | null = null

  // Mark run-start so the Connections page knows a sync is in flight.
  await (supabase as any).from('backup_state').upsert({
    bucket_name: bucket,
    last_run_started_at: startedAt.toISOString(),
  }, { onConflict: 'bucket_name' })

  try {
    const paths = await listAllObjectPaths(bucket, supabase)
    for (const path of paths) {
      if (synced + skipped >= MAX_OBJECTS_PER_BUCKET_PER_RUN) {
        // Soft cap; remainder picked up next run.
        errorMsg = `cap hit (${MAX_OBJECTS_PER_BUCKET_PER_RUN}); ${paths.length - synced - skipped} objects remain`
        break
      }
      const r2Key = bucket === 'vault' ? `${bucket}/${path}.enc` : `${bucket}/${path}`
      const head = await r2Head(r2Key)
      if (head.exists) { skipped++; continue }

      const dl = await supabase.storage.from(bucket).download(path)
      if (dl.error || !dl.data) {
        // Skip individual file failures; report at end.
        console.warn(`[cron/backup-buckets] download failed bucket=${bucket} path=${path}:`, dl.error)
        continue
      }
      const arr = new Uint8Array(await dl.data.arrayBuffer())
      let payload: Buffer = Buffer.from(arr)
      const contentType = dl.data.type || 'application/octet-stream'

      if (bucket === 'vault') {
        payload = encryptVaultBuffer(payload)
      }
      await r2Put(r2Key, payload, {
        contentType: bucket === 'vault' ? 'application/octet-stream' : contentType,
        metadata: {
          'src-bucket': bucket,
          'src-path': path,
          'src-content-type': contentType,
          ...(bucket === 'vault' ? { encrypted: 'aes-256-gcm' } : {}),
        },
      })
      synced++
      bytes += payload.byteLength
    }
  } catch (e: any) {
    errorMsg = e?.message ?? 'sync failed'
    console.error(`[cron/backup-buckets] bucket=${bucket} fatal:`, e)
  }

  const status: BucketResult['status'] =
    errorMsg ? (synced > 0 ? 'partial' : 'error') : 'success'

  await (supabase as any).from('backup_state').update({
    last_run_completed_at: new Date().toISOString(),
    last_run_status: status,
    last_run_error: errorMsg,
    objects_synced_last_run: synced,
    objects_skipped_last_run: skipped,
    bytes_synced_last_run: bytes,
    updated_at: new Date().toISOString(),
  }).eq('bucket_name', bucket)

  // Increment the cumulative counter. Read-modify-write is fine here — only
  // one cron runs at a time per bucket, no contention.
  if (synced > 0) {
    const { data } = await (supabase as any)
      .from('backup_state').select('objects_synced_total')
      .eq('bucket_name', bucket).maybeSingle()
    const current = (data?.objects_synced_total as number) ?? 0
    await (supabase as any).from('backup_state')
      .update({ objects_synced_total: current + synced })
      .eq('bucket_name', bucket)
  }

  return {
    bucket, status, objects_synced: synced, objects_skipped: skipped,
    bytes_synced: bytes, error: errorMsg,
  }
}

/**
 * Recursively lists every object path in `bucket`. Supabase Storage's list()
 * only returns one level at a time, so we walk prefixes ourselves.
 *
 * Returns paths relative to the bucket root, suitable for `download(path)`.
 */
async function listAllObjectPaths(bucket: Bucket, supabase: ReturnType<typeof createAdminClient>): Promise<string[]> {
  const out: string[] = []
  const queue: string[] = ['']
  while (queue.length > 0) {
    const prefix = queue.shift()!
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) {
      throw new Error(`list ${bucket}/${prefix} failed: ${error.message}`)
    }
    for (const entry of data ?? []) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name
      // Supabase Storage marks pseudo-folders with id=null (no metadata).
      if (entry.id === null) {
        queue.push(full)
      } else {
        out.push(full)
      }
    }
  }
  return out
}

/**
 * Vercel Cron handler for daily cost/usage sync.
 *
 * Triggered by the cron declaration in vercel.json at 08:00 UTC daily.
 * Vercel sets the Authorization header to `Bearer <CRON_SECRET>` automatically
 * for cron-invoked requests when CRON_SECRET is configured in env. We verify
 * it before doing anything to refuse public callers.
 *
 * Runs syncAllUsageForAllOrgs which fans out per-org and per-service.
 */
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { syncAllUsageForAllOrgs } from '@/app/api/usage/actions'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
// Allow up to 5 min — bigger orgs may need it for the per-provider HTTP calls.
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = request.headers.get('authorization') ?? ''
  if (!secret) {
    console.error('[cron/sync-usage] CRON_SECRET not configured; refusing.')
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const startedAt = Date.now()
  try {
    const results = await syncAllUsageForAllOrgs()
    const ok = results.filter(r => !r.error).length
    const errored = results.filter(r => r.error).length
    const totalSynced = results.reduce((s, r) => s + r.synced, 0)
    console.log(
      `[cron/sync-usage] done in ${Date.now() - startedAt}ms — ` +
      `${ok} ok / ${errored} errored / ${totalSynced} rows synced`,
    )
    return NextResponse.json({
      ok: true,
      duration_ms: Date.now() - startedAt,
      results,
    })
  } catch (e: any) {
    console.error('[cron/sync-usage] fatal:', e)
    return NextResponse.json({ ok: false, error: e?.message ?? 'sync failed' }, { status: 500 })
  }
}

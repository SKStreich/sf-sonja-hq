'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function getOrgId() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any).from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }
  if (!profile) throw new Error('No profile')
  return { supabase, org_id: profile.org_id }
}

export async function addManualEntry(payload: {
  service: string
  date: string       // YYYY-MM-DD
  cost_usd: number
  units?: number
  metric_type?: string
  notes?: string
}) {
  const { supabase, org_id } = await getOrgId()
  const { error } = await (supabase as any).from('resource_usage').insert({
    org_id,
    service: payload.service,
    metric_type: payload.metric_type ?? 'manual_entry',
    value: payload.units ?? 0,
    cost_usd: payload.cost_usd,
    period_start: payload.date,
    period_end: payload.date,
    source: 'manual',
    raw_data: { notes: payload.notes ?? null },
  })
  if (error) throw new Error('Failed to save: ' + error.message)
  revalidatePath('/dashboard/cost')
}

export async function deleteUsageEntry(id: string) {
  const { supabase } = await getOrgId()
  const { error } = await (supabase as any).from('resource_usage').delete().eq('id', id)
  if (error) throw new Error('Failed to delete')
  revalidatePath('/dashboard/cost')
}

export async function syncOpenAIUsage() {
  const { supabase, org_id } = await getOrgId()
  const admin = createAdminClient()

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === 'sk-placeholder') {
    return { synced: 0, error: 'OpenAI API key not configured' }
  }

  // Fetch last 30 days of usage from OpenAI
  const end = new Date()
  const start = new Date(); start.setDate(start.getDate() - 30)

  try {
    const res = await fetch(
      `https://api.openai.com/v1/usage?date=${start.toISOString().slice(0, 10)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) return { synced: 0, error: `OpenAI API error ${res.status}` }

    const json = await res.json()
    const entries = json.data ?? []
    let synced = 0

    for (const entry of entries) {
      // Whisper usage
      if (entry.whisper_api_duration && entry.whisper_api_duration > 0) {
        const costUsd = (entry.whisper_api_duration / 60) * 0.006
        await (admin as any).from('resource_usage').upsert({
          org_id,
          service: 'openai',
          metric_type: 'whisper_minutes',
          value: entry.whisper_api_duration / 60,
          cost_usd: costUsd,
          period_start: entry.aggregation_timestamp
            ? new Date(entry.aggregation_timestamp * 1000).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10),
          period_end: entry.aggregation_timestamp
            ? new Date(entry.aggregation_timestamp * 1000).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10),
          source: 'api_sync',
          synced_at: new Date().toISOString(),
          raw_data: entry,
        }, { onConflict: 'org_id,service,metric_type,period_start' })
        synced++
      }
    }

    revalidatePath('/dashboard/cost')
    return { synced, error: null }
  } catch (e: any) {
    return { synced: 0, error: e.message }
  }
}

// ── Auto-log helpers (called from API routes, not the user) ──────────────────

// Called whenever a Claude API request is made
export async function logAnthropicCall(orgId: string, inputTokens: number, outputTokens: number) {
  const admin = createAdminClient()
  // claude-sonnet-4-6: $3/M input, $15/M output
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15
  const today = new Date().toISOString().slice(0, 10)
  await (admin as any).from('resource_usage').insert({
    org_id: orgId,
    service: 'anthropic',
    metric_type: 'api_call',
    value: inputTokens + outputTokens,
    cost_usd: Math.max(costUsd, 0.0001),
    period_start: today,
    period_end: today,
    source: 'auto',
    synced_at: new Date().toISOString(),
    raw_data: { input_tokens: inputTokens, output_tokens: outputTokens },
  })
}

// Called from /api/whisper to auto-log each call
export async function logWhisperCall(orgId: string, durationSeconds?: number) {
  const admin = createAdminClient()
  const minutes = (durationSeconds ?? 10) / 60
  const costUsd = Math.max(minutes * 0.006, 0.001) // min $0.001
  const today = new Date().toISOString().slice(0, 10)

  await (admin as any).from('resource_usage').insert({
    org_id: orgId,
    service: 'openai',
    metric_type: 'whisper_call',
    value: minutes,
    cost_usd: costUsd,
    period_start: today,
    period_end: today,
    source: 'auto',
    synced_at: new Date().toISOString(),
    raw_data: { duration_seconds: durationSeconds ?? null },
  })
}

// ── API sync functions ────────────────────────────────────────────────────────

export type SyncResult = { service: string; synced: number; error: string | null }

export async function syncResendUsage(): Promise<SyncResult> {
  const { supabase, org_id } = await getOrgId()
  const admin = createAdminClient()
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { service: 'resend', synced: 0, error: 'RESEND_API_KEY not configured' }

  try {
    // Fetch emails sent in the last 30 days
    const since = new Date(); since.setDate(since.getDate() - 30)
    const res = await fetch('https://api.resend.com/emails?limit=100', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return { service: 'resend', synced: 0, error: `Resend API error ${res.status}` }

    const json = await res.json()
    const emails: any[] = json.data ?? []

    // Group by day
    const byDay: Record<string, number> = {}
    for (const email of emails) {
      const day = email.created_at?.slice(0, 10)
      if (day && day >= since.toISOString().slice(0, 10)) {
        byDay[day] = (byDay[day] ?? 0) + 1
      }
    }

    let synced = 0
    for (const [day, count] of Object.entries(byDay)) {
      const costUsd = (count / 1000) * 0.80
      await (admin as any).from('resource_usage').upsert({
        org_id,
        service: 'resend',
        metric_type: 'emails_sent',
        value: count,
        cost_usd: costUsd,
        period_start: day,
        period_end: day,
        source: 'api_sync',
        synced_at: new Date().toISOString(),
        raw_data: { email_count: count },
      }, { onConflict: 'org_id,service,metric_type,period_start' })
      synced++
    }

    revalidatePath('/dashboard/cost')
    return { service: 'resend', synced, error: null }
  } catch (e: any) {
    return { service: 'resend', synced: 0, error: e.message }
  }
}

export async function syncVercelUsage(): Promise<SyncResult> {
  const { supabase, org_id } = await getOrgId()
  const admin = createAdminClient()
  const token = process.env.VERCEL_TOKEN
  if (!token) return { service: 'vercel', synced: 0, error: 'VERCEL_TOKEN not configured' }

  try {
    const teamId = process.env.VERCEL_TEAM_ID
    const teamParam = teamId ? `&teamId=${teamId}` : ''
    const since = new Date(); since.setDate(since.getDate() - 30)

    const res = await fetch(
      `https://api.vercel.com/v6/deployments?limit=100&since=${since.getTime()}${teamParam}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return { service: 'vercel', synced: 0, error: `Vercel API error ${res.status}` }

    const json = await res.json()
    const deployments: any[] = json.deployments ?? []

    // Group deployments by day
    const byDay: Record<string, number> = {}
    for (const d of deployments) {
      const day = new Date(d.createdAt).toISOString().slice(0, 10)
      byDay[day] = (byDay[day] ?? 0) + 1
    }

    // Also upsert the monthly subscription cost on the 1st of current month
    const monthStart = new Date()
    monthStart.setDate(1)
    const monthKey = monthStart.toISOString().slice(0, 10)
    await (admin as any).from('resource_usage').upsert({
      org_id,
      service: 'vercel',
      metric_type: 'subscription',
      value: 1,
      cost_usd: 20.00,
      period_start: monthKey,
      period_end: monthKey,
      source: 'api_sync',
      synced_at: new Date().toISOString(),
      raw_data: { plan: 'Pro', note: 'Monthly subscription' },
    }, { onConflict: 'org_id,service,metric_type,period_start' })

    let synced = 1
    for (const [day, count] of Object.entries(byDay)) {
      await (admin as any).from('resource_usage').upsert({
        org_id,
        service: 'vercel',
        metric_type: 'deployments',
        value: count,
        cost_usd: 0,
        period_start: day,
        period_end: day,
        source: 'api_sync',
        synced_at: new Date().toISOString(),
        raw_data: { deployment_count: count },
      }, { onConflict: 'org_id,service,metric_type,period_start' })
      synced++
    }

    revalidatePath('/dashboard/cost')
    return { service: 'vercel', synced, error: null }
  } catch (e: any) {
    return { service: 'vercel', synced: 0, error: e.message }
  }
}

export async function syncNetlifyUsage(): Promise<SyncResult> {
  const { supabase, org_id } = await getOrgId()
  const admin = createAdminClient()
  const token = process.env.NETLIFY_AUTH_TOKEN
  const accountSlug = process.env.NETLIFY_ACCOUNT_SLUG
  if (!token) return { service: 'netlify', synced: 0, error: 'NETLIFY_AUTH_TOKEN not configured' }
  if (!accountSlug) return { service: 'netlify', synced: 0, error: 'NETLIFY_ACCOUNT_SLUG not configured' }

  try {
    // Get build usage for current billing period
    const res = await fetch(
      `https://api.netlify.com/api/v1/accounts/${accountSlug}/builds`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    if (!res.ok) return { service: 'netlify', synced: 0, error: `Netlify API error ${res.status}` }

    const builds: any[] = await res.json()
    const since = new Date(); since.setDate(since.getDate() - 30)

    const byDay: Record<string, { count: number; minutes: number }> = {}
    for (const build of builds) {
      const day = build.created_at?.slice(0, 10)
      if (!day || day < since.toISOString().slice(0, 10)) continue
      if (!byDay[day]) byDay[day] = { count: 0, minutes: 0 }
      byDay[day].count++
      byDay[day].minutes += (build.deploy_time ?? 0) / 60
    }

    // Monthly subscription cost
    const monthKey = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    await (admin as any).from('resource_usage').upsert({
      org_id,
      service: 'netlify',
      metric_type: 'subscription',
      value: 1,
      cost_usd: 19.00,
      period_start: monthKey,
      period_end: monthKey,
      source: 'api_sync',
      synced_at: new Date().toISOString(),
      raw_data: { plan: 'Pro', note: 'Monthly subscription' },
    }, { onConflict: 'org_id,service,metric_type,period_start' })

    let synced = 1
    for (const [day, data] of Object.entries(byDay)) {
      await (admin as any).from('resource_usage').upsert({
        org_id,
        service: 'netlify',
        metric_type: 'builds',
        value: data.minutes,
        cost_usd: 0,
        period_start: day,
        period_end: day,
        source: 'api_sync',
        synced_at: new Date().toISOString(),
        raw_data: { build_count: data.count, build_minutes: data.minutes },
      }, { onConflict: 'org_id,service,metric_type,period_start' })
      synced++
    }

    revalidatePath('/dashboard/cost')
    return { service: 'netlify', synced, error: null }
  } catch (e: any) {
    return { service: 'netlify', synced: 0, error: e.message }
  }
}

export async function syncAllUsage(): Promise<SyncResult[]> {
  const [openai, resend, vercel, netlify] = await Promise.all([
    syncOpenAIUsage().then(r => ({ service: 'openai', synced: r.synced, error: r.error })),
    syncResendUsage(),
    syncVercelUsage(),
    syncNetlifyUsage(),
  ])
  revalidatePath('/dashboard/cost')
  return [openai, resend, vercel, netlify]
}

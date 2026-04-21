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

// ── Service config ────────────────────────────────────────────────────────────

export type ServiceStatus = 'active' | 'paused'

export interface ServiceConfig {
  service: string
  status: ServiceStatus
  last_activity_at: string | null
}

export async function getServiceConfigs(): Promise<ServiceConfig[]> {
  const { supabase } = await getOrgId()
  const { data } = await (supabase as any)
    .from('service_configs')
    .select('service, status, last_activity_at')
  return (data ?? []) as ServiceConfig[]
}

export async function setServiceStatus(service: string, status: ServiceStatus) {
  const { supabase, org_id } = await getOrgId()
  await (supabase as any).from('service_configs').upsert(
    { org_id, service, status, updated_at: new Date().toISOString() },
    { onConflict: 'org_id,service' }
  )
  revalidatePath('/dashboard/cost')
}

// ── Manual entry ──────────────────────────────────────────────────────────────

export async function addManualEntry(payload: {
  service: string
  date: string
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

// ── Auto-log helpers (called from API routes / actions) ───────────────────────

export async function logAnthropicCall(orgId: string, inputTokens: number, outputTokens: number) {
  const admin = createAdminClient()
  const costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15
  const today = new Date().toISOString().slice(0, 10)
  await Promise.all([
    (admin as any).from('resource_usage').insert({
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
    }),
    // Touch service activity (upsert — won't overwrite if already active)
    (admin as any).from('service_configs').upsert(
      { org_id: orgId, service: 'anthropic', last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'org_id,service', ignoreDuplicates: false }
    ).then(() => {}).catch(() => {}),
  ])
}

export async function logWhisperCall(orgId: string, durationSeconds?: number) {
  const admin = createAdminClient()
  const minutes = (durationSeconds ?? 10) / 60
  const costUsd = Math.max(minutes * 0.006, 0.001)
  const today = new Date().toISOString().slice(0, 10)
  await Promise.all([
    (admin as any).from('resource_usage').insert({
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
    }),
    (admin as any).from('service_configs').upsert(
      { org_id: orgId, service: 'openai', last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'org_id,service', ignoreDuplicates: false }
    ).then(() => {}).catch(() => {}),
  ])
}

// ── API sync functions ────────────────────────────────────────────────────────

export type SyncResult = { service: string; synced: number; error: string | null }

export async function syncOpenAIUsage(): Promise<SyncResult> {
  const { supabase, org_id } = await getOrgId()
  const admin = createAdminClient()
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === 'sk-placeholder') return { service: 'openai', synced: 0, error: 'OpenAI API key not configured' }

  const end = new Date()
  const start = new Date(); start.setDate(start.getDate() - 30)

  try {
    const res = await fetch(
      `https://api.openai.com/v1/usage?date=${start.toISOString().slice(0, 10)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    )
    if (!res.ok) return { service: 'openai', synced: 0, error: `OpenAI API error ${res.status}` }

    const json = await res.json()
    const entries = json.data ?? []
    let synced = 0

    for (const entry of entries) {
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
    return { service: 'openai', synced, error: null }
  } catch (e: any) {
    return { service: 'openai', synced: 0, error: e.message }
  }
}

export async function syncResendUsage(): Promise<SyncResult> {
  const { supabase, org_id } = await getOrgId()
  const admin = createAdminClient()
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) return { service: 'resend', synced: 0, error: 'RESEND_API_KEY not configured' }

  try {
    const since = new Date(); since.setDate(since.getDate() - 30)
    const res = await fetch('https://api.resend.com/emails?limit=100', {
      headers: { Authorization: `Bearer ${apiKey}` },
    })
    if (!res.ok) return { service: 'resend', synced: 0, error: `Resend API error ${res.status}` }

    const json = await res.json()
    const emails: any[] = json.data ?? []

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

    const byDay: Record<string, number> = {}
    for (const d of deployments) {
      const day = new Date(d.createdAt).toISOString().slice(0, 10)
      byDay[day] = (byDay[day] ?? 0) + 1
    }

    const monthKey = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    await (admin as any).from('resource_usage').upsert({
      org_id, service: 'vercel', metric_type: 'subscription',
      value: 1, cost_usd: 20.00, period_start: monthKey, period_end: monthKey,
      source: 'api_sync', synced_at: new Date().toISOString(),
      raw_data: { plan: 'Pro', note: 'Monthly subscription' },
    }, { onConflict: 'org_id,service,metric_type,period_start' })

    let synced = 1
    for (const [day, count] of Object.entries(byDay)) {
      await (admin as any).from('resource_usage').upsert({
        org_id, service: 'vercel', metric_type: 'deployments',
        value: count, cost_usd: 0, period_start: day, period_end: day,
        source: 'api_sync', synced_at: new Date().toISOString(),
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

    const monthKey = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    await (admin as any).from('resource_usage').upsert({
      org_id, service: 'netlify', metric_type: 'subscription',
      value: 1, cost_usd: 19.00, period_start: monthKey, period_end: monthKey,
      source: 'api_sync', synced_at: new Date().toISOString(),
      raw_data: { plan: 'Pro', note: 'Monthly subscription' },
    }, { onConflict: 'org_id,service,metric_type,period_start' })

    let synced = 1
    for (const [day, data] of Object.entries(byDay)) {
      await (admin as any).from('resource_usage').upsert({
        org_id, service: 'netlify', metric_type: 'builds',
        value: data.minutes, cost_usd: 0, period_start: day, period_end: day,
        source: 'api_sync', synced_at: new Date().toISOString(),
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

export async function syncSupabaseUsage(): Promise<SyncResult> {
  const { supabase, org_id } = await getOrgId()
  const admin = createAdminClient()
  const monthKey = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)

  try {
    // Supabase has no billing API — record subscription tier as a fixed monthly entry.
    // Update cost_usd manually if you upgrade to Pro ($25/mo).
    await (admin as any).from('resource_usage').upsert({
      org_id, service: 'supabase', metric_type: 'subscription',
      value: 1, cost_usd: 0,
      period_start: monthKey, period_end: monthKey,
      source: 'api_sync', synced_at: new Date().toISOString(),
      raw_data: { plan: 'Free', note: 'Update cost_usd to 25 if on Pro plan' },
    }, { onConflict: 'org_id,service,metric_type,period_start' })

    revalidatePath('/dashboard/cost')
    return { service: 'supabase', synced: 1, error: null }
  } catch (e: any) {
    return { service: 'supabase', synced: 0, error: e.message }
  }
}

export async function syncAllUsage(): Promise<SyncResult[]> {
  // Respect paused services — skip their sync
  const configs = await getServiceConfigs()
  const paused = new Set(configs.filter(c => c.status === 'paused').map(c => c.service))

  const skip = (svc: string): SyncResult => ({ service: svc, synced: 0, error: 'Paused' })

  const [openai, resend, vercel, netlify, supabase] = await Promise.all([
    paused.has('openai')   ? skip('openai')   : syncOpenAIUsage(),
    paused.has('resend')   ? skip('resend')   : syncResendUsage(),
    paused.has('vercel')   ? skip('vercel')   : syncVercelUsage(),
    paused.has('netlify')  ? skip('netlify')  : syncNetlifyUsage(),
    paused.has('supabase') ? skip('supabase') : syncSupabaseUsage(),
  ])

  revalidatePath('/dashboard/cost')
  return [openai, resend, vercel, netlify, supabase]
}

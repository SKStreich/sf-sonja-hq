'use server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

async function getOrgId() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase.from('user_profiles').select('org_id').eq('id', user.id).single()
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

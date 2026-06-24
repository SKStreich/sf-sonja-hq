'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { getAnthropicApiKey } from '@/lib/anthropic-key'
import { classifyEntry } from '@/lib/knowledge/classify'
import { insertInboxEntry } from '@/lib/knowledge/inbox-create'
import { ENTITY_SLUGS } from '@/lib/entities/config'

interface CapturePayload { type: 'idea' | 'task'; content: string; entity_context: string | null }

/**
 * Capture API (Sprint 13 T2): a quick capture now creates a knowledge_entries
 * row in the triage inbox (born 'inbox', no forced entity — D2), with the AI's
 * entity guess carried as a pre-selected suggestion (D6). Replaces the old
 * write to the separate, UI-less `captures` table.
 */
export async function submitCapture(payload: CapturePayload) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }
  if (!profile) throw new Error('No profile')

  const text = payload.content.trim()
  if (!text) throw new Error('Content is required')
  const kind = payload.type === 'idea' ? 'idea' : 'note'

  const c = await classifyEntry(text, { apiKey: getAnthropicApiKey() })
  const hinted = payload.entity_context?.trim().toLowerCase() ?? null
  const suggestedEntity = (hinted && (ENTITY_SLUGS as readonly string[]).includes(hinted))
    ? hinted
    : c.suggested_entity

  await insertInboxEntry(supabase, user.id, profile.org_id, {
    body: text,
    kind,
    title: c.title,
    summary: c.summary,
    typeHint: c.type_hint,
    tags: c.tags,
    suggestedEntity,
    source: 'capture_api',
  })
  revalidatePath('/dashboard/knowledge')
  revalidatePath('/dashboard')
}

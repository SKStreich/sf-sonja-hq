'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'

async function getContext() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single() as { data: { org_id: string } | null }
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id }
}

export interface ChatPayload {
  title: string
  summary?: string | null
  key_decisions?: string[]
  entity_id?: string | null
  url?: string | null
  chat_date?: string | null
  tags?: string[]
  claude_chat_id?: string | null
}

export async function addChatEntry(payload: ChatPayload) {
  const { supabase, user, org_id } = await getContext()
  const { error } = await (supabase as any).from('chat_history').insert({
    org_id,
    user_id: user.id,
    created_by: user.id,
    title: payload.title.trim(),
    summary: payload.summary?.trim() ?? null,
    key_decisions: payload.key_decisions ?? [],
    entity_id: payload.entity_id ?? null,
    url: payload.url?.trim() ?? null,
    chat_date: payload.chat_date ?? new Date().toISOString().slice(0, 10),
    tags: payload.tags ?? [],
    claude_chat_id: payload.claude_chat_id ?? null,
  })
  if (error) throw new Error('Failed to save chat entry')
  revalidatePath('/dashboard/chats')
}

export async function updateChatEntry(id: string, payload: Partial<ChatPayload>) {
  const { supabase } = await getContext()
  const { error } = await (supabase as any).from('chat_history').update({
    ...(payload.title !== undefined && { title: payload.title.trim() }),
    ...(payload.summary !== undefined && { summary: payload.summary?.trim() ?? null }),
    ...(payload.key_decisions !== undefined && { key_decisions: payload.key_decisions }),
    ...(payload.entity_id !== undefined && { entity_id: payload.entity_id }),
    ...(payload.url !== undefined && { url: payload.url?.trim() ?? null }),
    ...(payload.chat_date !== undefined && { chat_date: payload.chat_date }),
    ...(payload.tags !== undefined && { tags: payload.tags }),
  }).eq('id', id)
  if (error) throw new Error('Failed to update chat entry')
  revalidatePath('/dashboard/chats')
}

export async function deleteChatEntry(id: string) {
  const { supabase } = await getContext()
  await (supabase as any).from('chat_history').delete().eq('id', id)
  revalidatePath('/dashboard/chats')
}

export interface ExtractedInsights {
  title: string
  summary: string
  key_decisions: string[]
  suggested_tags: string[]
  entity_hint: string | null
}

export async function extractChatInsights(rawText: string): Promise<ExtractedInsights> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey })

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are extracting structured metadata from a Claude chat conversation. Analyze the conversation below and respond with ONLY valid JSON matching this exact schema:

{
  "title": "concise title (max 80 chars)",
  "summary": "2-3 sentence summary of what was discussed and decided",
  "key_decisions": ["array of specific decisions, conclusions, or action items — max 8"],
  "suggested_tags": ["2-4 relevant topic tags, lowercase"],
  "entity_hint": "one of: tm, sf, personal, or null if unclear"
}

Conversation:
${rawText.slice(0, 8000)}`,
    }],
  })

  const text = response.content[0].type === 'text' ? response.content[0].text : ''

  // Strip markdown code fences if present
  const jsonStr = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim()

  try {
    const parsed = JSON.parse(jsonStr)
    return {
      title: parsed.title ?? 'Untitled Chat',
      summary: parsed.summary ?? '',
      key_decisions: Array.isArray(parsed.key_decisions) ? parsed.key_decisions : [],
      suggested_tags: Array.isArray(parsed.suggested_tags) ? parsed.suggested_tags : [],
      entity_hint: parsed.entity_hint ?? null,
    }
  } catch {
    throw new Error('Failed to parse AI response')
  }
}

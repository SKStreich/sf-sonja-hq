'use server'
/**
 * Knowledge chat — an embedded AI conversation anchored to a specific entry.
 *
 * Each chat is itself a kind='chat' knowledge_entry; messages live in
 * knowledge_chats. A knowledge_links row of relation='chat_about' ties the
 * chat back to the entry it was opened from.
 *
 * Vault entries are never passed into Claude's context.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import Anthropic from '@anthropic-ai/sdk'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  created_at: string
}

async function getCtx() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile')
  return { supabase, user, org_id: profile.org_id as string }
}

/**
 * Get or create a chat entry for a given source entry. Returns the chat entry id.
 * If sourceEntryId is null, creates a standalone chat.
 */
export async function getOrCreateChat(sourceEntryId: string | null): Promise<{ chatId: string }> {
  const { supabase, user, org_id } = await getCtx()

  if (sourceEntryId) {
    // Check source isn't vault
    const { data: src } = await (supabase as any)
      .from('knowledge_entries').select('access, entity, title')
      .eq('id', sourceEntryId).maybeSingle()
    if (!src) throw new Error('Source entry not found')
    if (src.access === 'vault') throw new Error('Cannot chat about a vault entry')

    // Reuse an existing chat_about link if one exists for this user
    const { data: existingLink } = await (supabase as any)
      .from('knowledge_links')
      .select('from_entry')
      .eq('to_entry', sourceEntryId)
      .eq('relation', 'chat_about')
      .eq('created_by', user.id)
      .maybeSingle()
    if (existingLink?.from_entry) return { chatId: existingLink.from_entry as string }

    const { data: chat, error } = await (supabase as any)
      .from('knowledge_entries')
      .insert({
        org_id, user_id: user.id,
        kind: 'chat', access: 'standard',
        entity: src.entity,
        title: `Chat — ${src.title ?? 'entry'}`,
        body: null, source: 'manual',
      }).select('id').single()
    if (error) throw new Error('Failed to create chat: ' + error.message)

    await (supabase as any).from('knowledge_links').insert({
      from_entry: chat.id, to_entry: sourceEntryId,
      relation: 'chat_about', created_by: user.id,
    })

    return { chatId: chat.id as string }
  }

  const { data: chat, error } = await (supabase as any)
    .from('knowledge_entries')
    .insert({
      org_id, user_id: user.id,
      kind: 'chat', access: 'standard',
      entity: 'personal',
      title: `Chat — ${new Date().toLocaleString()}`,
      body: null, source: 'manual',
    }).select('id').single()
  if (error) throw new Error('Failed to create chat: ' + error.message)
  return { chatId: chat.id as string }
}

export async function listChatMessages(chatId: string): Promise<ChatMessage[]> {
  const { supabase } = await getCtx()
  const { data, error } = await (supabase as any)
    .from('knowledge_chats')
    .select('id, role, content, created_at')
    .eq('entry_id', chatId)
    .order('created_at', { ascending: true })
  if (error) throw new Error('Failed to list messages: ' + error.message)
  return (data ?? []) as ChatMessage[]
}

/**
 * Send a user message, get a Claude reply, persist both. Returns updated message list.
 * Builds context from the linked source entry (if any) + recent neighbors.
 */
export async function sendChatMessage(chatId: string, userMessage: string): Promise<ChatMessage[]> {
  const { supabase, user, org_id } = await getCtx()
  const text = userMessage.trim()
  if (!text) throw new Error('Message is empty')

  // Ensure chat belongs to caller.
  const { data: chatEntry } = await (supabase as any)
    .from('knowledge_entries').select('id, kind, user_id')
    .eq('id', chatId).maybeSingle()
  if (!chatEntry || chatEntry.user_id !== user.id || chatEntry.kind !== 'chat') {
    throw new Error('Chat not found')
  }

  // Persist user message first.
  await (supabase as any).from('knowledge_chats').insert({
    entry_id: chatId, role: 'user', content: text,
  })

  // Load history for context.
  const { data: history } = await (supabase as any)
    .from('knowledge_chats')
    .select('role, content')
    .eq('entry_id', chatId)
    .order('created_at', { ascending: true })
    .limit(40)

  // Find the source entry for this chat (via chat_about link).
  const { data: link } = await (supabase as any)
    .from('knowledge_links')
    .select('to_entry')
    .eq('from_entry', chatId)
    .eq('relation', 'chat_about')
    .maybeSingle()

  let sourceContext = ''
  if (link?.to_entry) {
    const { data: src } = await (supabase as any)
      .from('knowledge_entries')
      .select('title, body, summary, kind, entity, tags, access')
      .eq('id', link.to_entry)
      .maybeSingle()
    if (src && src.access !== 'vault') {
      sourceContext = `SOURCE ENTRY
kind: ${src.kind}
entity: ${src.entity}
title: ${src.title ?? '(untitled)'}
tags: ${(src.tags ?? []).join(', ')}
${src.body ?? src.summary ?? ''}`.slice(0, 6000)
    }
  }

  // Pull a few org neighbors as background (excluding vault).
  const { data: neighbors } = await (supabase as any)
    .from('knowledge_entries')
    .select('title, summary, kind, entity')
    .eq('org_id', org_id)
    .eq('access', 'standard')
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(10)
  const neighborText = (neighbors ?? [])
    .map((n: any) => `- (${n.kind}/${n.entity}) ${n.title ?? ''} — ${n.summary ?? ''}`)
    .join('\n')

  const apiKey = process.env.ANTHROPIC_API_KEY
  let replyText = 'ANTHROPIC_API_KEY not configured — cannot generate reply.'
  if (apiKey) {
    const client = new Anthropic({ apiKey })
    const systemPrompt = `You are Sonja's HQ assistant. Help her think through ideas, spot flaws, and connect them to existing work. Be concise, direct, and specific. Do not repeat her question back.

${sourceContext}

RECENT KNOWLEDGE IN HER HUB:
${neighborText || '(nothing recent)'}`
    const res = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: (history ?? []).map((m: any) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    })
    replyText = res.content[0].type === 'text' ? res.content[0].text : '(no reply)'
  }

  await (supabase as any).from('knowledge_chats').insert({
    entry_id: chatId, role: 'assistant', content: replyText,
  })

  revalidatePath('/dashboard/knowledge')
  return listChatMessages(chatId)
}

'use server'
/**
 * Server action: save the current HQ Agent thread as a workspace entry.
 *
 * Serializes the in-memory thread via `chatToMarkdown`, then delegates to
 * `createWorkspacePage` which inserts the row and runs mention-sync. The
 * resulting entry is a regular workspace page (kind='workspace') tagged
 * `hq-chat` so it stays discoverable as a saved conversation.
 *
 * `source='chat_extraction'` reuses the existing knowledge_entries.source
 * CHECK-constrained value most semantically close to "this came from a chat
 * with the agent." A future migration could add a dedicated 'hq_agent_chat'
 * value if precise provenance becomes useful — for now the tag is enough.
 */
import { createWorkspacePage } from '@/app/api/knowledge/workspace'
import { chatToMarkdown, defaultChatTitle, type AgentMessageLike } from '@/lib/agent/chat-to-markdown'
import type { Entity } from '@/app/api/knowledge/actions'

export interface SaveChatOptions {
  title?: string
  entity?: Entity
  parentId?: string | null
}

export async function saveChatToWorkspace(
  messages: AgentMessageLike[],
  opts: SaveChatOptions = {},
): Promise<{ id: string }> {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Cannot save an empty conversation')
  }

  const body = chatToMarkdown(messages)
  const title = (opts.title ?? '').trim() || defaultChatTitle(messages)

  return createWorkspacePage({
    title,
    entity: opts.entity,
    parentId: opts.parentId ?? null,
    body,
    source: 'chat_extraction',
    tags: ['hq-chat'],
  })
}

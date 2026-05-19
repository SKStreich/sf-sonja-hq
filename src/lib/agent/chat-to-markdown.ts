/**
 * Serialize an HQ Agent thread into Markdown for "Save chat to workspace".
 *
 * Pure function so unit tests don't need a DB. The result is what gets stored
 * in `knowledge_entries.body` when the user clicks Save to workspace.
 *
 * Format:
 *   > _Saved {date} from HQ Agent_
 *
 *   **You**
 *   > user message line 1
 *   > user message line 2
 *
 *   **HQ Agent**
 *   > assistant reply
 *   > ```ts
 *   > code block
 *   > ```
 *
 * Code blocks inside assistant messages are preserved verbatim. We don't
 * re-format them, because the assistant's fence markers are part of the
 * content the user wants to keep. We DO quote each line so blockquote
 * styling cleanly separates the message from any surrounding workspace
 * content.
 */

export interface AgentMessageLike {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatToMarkdownOptions {
  /** Defaults to new Date() at call time. Passed in for deterministic tests. */
  takenAt?: Date
  /** Localized label for the user side. Defaults to "You". */
  userLabel?: string
  /** Localized label for the agent side. Defaults to "HQ Agent". */
  agentLabel?: string
}

export function chatToMarkdown(
  messages: AgentMessageLike[],
  opts: ChatToMarkdownOptions = {},
): string {
  const taken = opts.takenAt ?? new Date()
  const userLabel = opts.userLabel ?? 'You'
  const agentLabel = opts.agentLabel ?? 'HQ Agent'

  const header = `> _Saved ${formatStamp(taken)} from HQ Agent_`
  if (messages.length === 0) {
    return `${header}\n\n_Empty conversation._\n`
  }

  const blocks: string[] = [header, '']
  for (const m of messages) {
    const label = m.role === 'user' ? userLabel : agentLabel
    const quoted = blockquote(m.content)
    blocks.push(`**${label}**`)
    blocks.push(quoted)
    blocks.push('')
  }
  // Trim the trailing blank line we appended after the last message.
  while (blocks.length > 0 && blocks[blocks.length - 1] === '') blocks.pop()
  return blocks.join('\n') + '\n'
}

/**
 * Default title for a saved thread — first user message, trimmed to 80 chars
 * on a word boundary, falling back to "Chat with HQ Agent".
 */
export function defaultChatTitle(messages: AgentMessageLike[]): string {
  const firstUser = messages.find(m => m.role === 'user')?.content?.trim()
  if (!firstUser) return 'Chat with HQ Agent'
  const oneLine = firstUser.split(/\r?\n/)[0]
  if (oneLine.length <= 80) return oneLine
  const cut = oneLine.slice(0, 80)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 40 ? cut.slice(0, lastSpace) : cut) + '…'
}

function blockquote(content: string): string {
  // Empty content shouldn't render an empty quote — emit a placeholder so the
  // structure of the saved thread still reads correctly.
  if (content.length === 0) return '> _(empty message)_'
  return content
    .split(/\r?\n/)
    .map(line => (line.length === 0 ? '>' : `> ${line}`))
    .join('\n')
}

function formatStamp(d: Date): string {
  // YYYY-MM-DD HH:MM UTC — deterministic format, no locale dependency, easy to
  // skim. Workspace entries already have an `updated_at` for full precision.
  const y = d.getUTCFullYear()
  const mo = pad2(d.getUTCMonth() + 1)
  const da = pad2(d.getUTCDate())
  const h = pad2(d.getUTCHours())
  const mi = pad2(d.getUTCMinutes())
  return `${y}-${mo}-${da} ${h}:${mi} UTC`
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

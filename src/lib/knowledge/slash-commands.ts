// Slash-command machinery for the workspace Markdown editor.
//
// `detectSlashToken` is the pure trigger predicate: given the editor value and
// caret position, it reports whether a `/foo` token is currently being typed at
// the caret, and returns the token's start index plus the query (text after the
// `/`). The popup component uses this to decide when to open and what to filter.
//
// Trigger rules:
//   - The `/` must be at line start, or preceded by ASCII whitespace.
//   - The query (text between `/` and caret) must not contain whitespace or
//     newline. Typing a space or hitting Enter closes the popup naturally.
//   - `//` does not trigger (avoids comment-like prefixes and URL paths).

export type SlashTokenMatch =
  | { open: true; start: number; query: string }
  | { open: false }

export function detectSlashToken(value: string, caret: number): SlashTokenMatch {
  if (caret <= 0 || caret > value.length) return { open: false }

  // Walk back from caret to find a `/` that could open the token.
  let i = caret - 1
  while (i >= 0) {
    const ch = value[i]
    if (ch === '/') break
    if (ch === ' ' || ch === '\t' || ch === '\n') return { open: false }
    i--
  }
  if (i < 0) return { open: false }

  // The character before `/` must be line start or whitespace.
  const prev = i === 0 ? '\n' : value[i - 1]
  if (prev !== '\n' && prev !== ' ' && prev !== '\t') return { open: false }

  const query = value.slice(i + 1, caret)
  // Reject if the query contains whitespace or newline (would have bailed
  // already, but keep the invariant explicit).
  if (/[\s]/.test(query)) return { open: false }

  return { open: true, start: i, query }
}

export type SlashCommandInsert = (ctx: {
  value: string
  tokenStart: number
  caret: number
}) => { next: string; cursor: number }

export type SlashCommand = {
  name: string
  label: string
  hint?: string
  icon?: string
  insert: SlashCommandInsert
}

// /task — replace the `/task` token with a GFM task checkbox at line start.
// If the cursor is mid-line (the `/` was preceded by whitespace), we still
// place the checkbox at the start of the current line by walking back from
// `tokenStart` to the previous newline.
const taskCommand: SlashCommand = {
  name: '/task',
  label: 'Task',
  hint: 'Insert checkbox',
  icon: '☐',
  insert: ({ value, tokenStart, caret }) => {
    const lineStart = value.lastIndexOf('\n', tokenStart - 1) + 1
    const beforeLine = value.slice(0, lineStart)
    const linePrefix = value.slice(lineStart, tokenStart)
    const after = value.slice(caret)

    // If the line already has non-whitespace content before the `/`, push the
    // checkbox to a new line so we don't append after an existing sentence.
    const hasContent = /\S/.test(linePrefix)
    const head = hasContent ? `${beforeLine}${linePrefix}\n- [ ] ` : `${beforeLine}- [ ] `
    const next = head + after
    return { next, cursor: head.length }
  },
}

export const SLASH_COMMANDS: SlashCommand[] = [taskCommand]

export function filterSlashCommands(query: string): SlashCommand[] {
  const q = query.toLowerCase()
  if (!q) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter(
    c => c.name.slice(1).toLowerCase().startsWith(q) || c.label.toLowerCase().includes(q),
  )
}

/**
 * Assemble the Markdown body for a saved code snippet workspace entry.
 *
 * Pure function. The server action `saveCodeSnippet` calls this and stores
 * the result in `knowledge_entries.body`. The result uses:
 *   - A fenced code block tagged with the language (so syntax highlighting in
 *     the Markdown renderer works without further configuration).
 *   - A **Source** line with the GitHub commit URL when present — readers
 *     can click straight to GitHub.
 *   - A `[[Project: Name]]` mention when a project is provided — the
 *     existing workspace-mention syncer (PR #10) will turn this into a real
 *     two-way link automatically.
 *
 * The user's snippet content is inserted verbatim. If it happens to contain
 * a triple-backtick that would close our fence early, we promote the fence
 * to four backticks (Markdown allows arbitrary-length fences as long as the
 * opener and closer match).
 */

export interface SnippetBodyInput {
  language: string
  code: string
  sourceUrl?: string | null
  projectName?: string | null
  /** Optional human-readable label for the source link (defaults to the URL itself). */
  sourceLabel?: string | null
}

export function snippetBody(input: SnippetBodyInput): string {
  const lang = (input.language || '').trim().toLowerCase()
  const code = input.code ?? ''
  const fence = fenceFor(code)

  const parts: string[] = []
  parts.push(`${fence}${lang}`)
  parts.push(code)
  parts.push(fence)

  if (input.sourceUrl && input.sourceUrl.trim().length > 0) {
    const url = input.sourceUrl.trim()
    const label = (input.sourceLabel ?? '').trim() || url
    parts.push('')
    parts.push(`**Source:** [${escapeLinkText(label)}](${url})`)
  }

  if (input.projectName && input.projectName.trim().length > 0) {
    parts.push('')
    parts.push(`**Project:** [[Project: ${input.projectName.trim()}]]`)
  }

  return parts.join('\n') + '\n'
}

/**
 * Default title for a snippet — derived from the first non-empty line of
 * code, trimmed. Falls back to "Code snippet" if the code is empty or all
 * whitespace.
 */
export function defaultSnippetTitle(code: string): string {
  const firstLine = (code ?? '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .find(l => l.length > 0)
  if (!firstLine) return 'Code snippet'
  if (firstLine.length <= 80) return firstLine
  return firstLine.slice(0, 77) + '…'
}

function fenceFor(code: string): string {
  // Pick the smallest backtick fence that won't be terminated by content.
  // Markdown allows N+ backticks as long as fence length matches.
  const longestRun = (code.match(/`+/g) ?? [])
    .reduce((max, run) => Math.max(max, run.length), 0)
  const len = Math.max(3, longestRun + 1)
  return '`'.repeat(len)
}

function escapeLinkText(text: string): string {
  // Markdown link text — escape ] so the link doesn't terminate early.
  return text.replace(/\]/g, '\\]')
}

// HTML → Markdown — used by convert-in-place / reflow so an uploaded HTML doc
// becomes a real, editable Markdown page body (GFM tables preserved) rather
// than the flattened single-line text that ingest extracts. Pure (turndown
// bundles its own DOM parser, so it runs server-side and in tests).

import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm' // types declared in src/types/turndown-plugin-gfm.d.ts

/** Strip a leading injected <style>…</style> preamble (the migrator adds one to
 *  every recovered-table fragment) so it doesn't end up as literal text. */
function stripStyleBlocks(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, '')
}

let _service: TurndownService | null = null
function service(): TurndownService {
  if (_service) return _service
  const s = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  })
  s.use(gfm) // GFM tables / strikethrough / task lists
  _service = s
  return s
}

/** Convert an HTML fragment to Markdown. Returns '' for empty input. */
export function htmlToMarkdown(html: string | null | undefined): string {
  const src = (html ?? '').trim()
  if (!src) return ''
  return service()
    .turndown(stripStyleBlocks(src))
    .replace(/\n{3,}/g, '\n\n') // collapse runs of blank lines
    .trim()
}

// HTML → Markdown — used by convert-in-place / reflow so an uploaded HTML doc
// becomes a real, editable Markdown page body (GFM tables preserved) rather
// than the flattened single-line text that ingest extracts. Pure (turndown
// bundles its own DOM parser, so it runs server-side and in tests).

import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm' // types declared in src/types/turndown-plugin-gfm.d.ts

/** Pre-clean HTML before turndown:
 *  - drop the injected <style>…</style> preamble (the migrator adds one to every
 *    recovered-table fragment) so it never leaks as literal text;
 *  - replace <br> with a space. A hard line break inside a GFM table cell would
 *    split one logical row across physical lines and break the table parse, and
 *    react-markdown here renders no raw HTML, so a literal <br> wouldn't help.
 *    These docs use <br> mostly inside table cells, so a space is the safe call. */
function preprocessHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
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
    .turndown(preprocessHtml(src))
    .replace(/\n{3,}/g, '\n\n') // collapse runs of blank lines
    .trim()
}

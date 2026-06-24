/**
 * Bulk-import parsing (Sprint 13 T3). PURE — no I/O — so the hub can preview the
 * split and the server action shares the same item shape. Turns a pasted blob or
 * an uploaded text file into discrete inbox items, each with a stable ref for
 * non-destructive re-runs (dedupe by org+source+ref).
 */

export type SplitMode = 'lines' | 'paragraphs'

export interface BulkItem {
  body: string
  /** First non-empty line, for the inbox card title. */
  title: string
  /** Stable content hash — the external_ref used to dedupe re-imports. */
  ref: string
}

/** djb2 string hash → unsigned hex. Deterministic across runs (no crypto needed
 *  for a dedupe key; collisions are astronomically unlikely for note-sized text). */
export function bulkItemRef(body: string): string {
  let h = 5381
  const s = body.trim()
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(16).padStart(8, '0')
}

function firstLine(body: string): string {
  const line = body.split('\n').map(l => l.trim()).find(Boolean) ?? ''
  return line.slice(0, 120)
}

/** Split raw text into trimmed, non-empty chunks. 'lines' = one item per line;
 *  'paragraphs' = split on blank lines (one item per paragraph block). */
export function splitBulkText(text: string, mode: SplitMode): string[] {
  const raw = mode === 'paragraphs'
    ? text.split(/\n\s*\n/)
    : text.split(/\r?\n/)
  return raw.map(s => s.trim()).filter(Boolean)
}

/** Parse raw text into deduped BulkItems (within-batch dedupe by ref). */
export function parseBulkItems(text: string, mode: SplitMode): BulkItem[] {
  const seen = new Set<string>()
  const items: BulkItem[] = []
  for (const body of splitBulkText(text, mode)) {
    const ref = bulkItemRef(body)
    if (seen.has(ref)) continue
    seen.add(ref)
    items.push({ body, title: firstLine(body), ref })
  }
  return items
}

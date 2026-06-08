/**
 * Merge Knowledge Entries — pure, testable core (no server context).
 *
 * The server orchestration lives in `src/app/api/knowledge/merge.ts`; everything
 * here is side-effect-free so it can be unit-tested without a Supabase client.
 * Locked decisions (spec `hq_merge-entries_v2.html`):
 *   OQ4 union metadata · OQ5 flag conflicts · OQ7 sonnet + ~40k char cap.
 */
import { sortEntitySlugs, ENTITY_SLUGS } from '@/lib/entities/config'

export const MERGE_MODEL = 'claude-sonnet-4-6'
/** Combined source-body budget handed to the model (OQ7). */
export const MERGE_CHAR_CAP = 40_000
export const MERGE_MAX_TOKENS = 8_000

// Mirror the enums in knowledge/actions.ts (that file is 'use server', so its
// const arrays aren't importable as values).
export const MERGE_KINDS = ['idea', 'doc', 'chat', 'note', 'critique', 'workspace'] as const
export type MergeKind = typeof MERGE_KINDS[number]
export const MERGE_TYPE_HINTS = ['decision', 'strategy', 'primer', 'brand', 'marketing', 'business', 'idea'] as const
export type MergeTypeHint = typeof MERGE_TYPE_HINTS[number]

/** A source entry, as the merge needs to see it. */
export interface MergeSource {
  id: string
  title: string | null
  kind: string
  /** Full entity membership (from the junction). */
  entities: string[]
  tags: string[]
  body: string | null
  parent_id: string | null
}

/** The AI (or fallback) draft of the merged document. */
export interface MergeDraftBody {
  title: string
  type_hint: MergeTypeHint
  body: string
}

// ── union math (OQ4) ──────────────────────────────────────────────────────────

/** Union of all sources' entities, de-duped + canonically sorted. */
export function unionMergeEntities(sources: MergeSource[]): string[] {
  const set = new Set<string>()
  for (const s of sources) for (const e of s.entities ?? []) {
    if ((ENTITY_SLUGS as readonly string[]).includes(e)) set.add(e)
  }
  return sortEntitySlugs(Array.from(set))
}

/** Union of all sources' tags, lower-cased + de-duped, original order preserved. */
export function unionMergeTags(sources: MergeSource[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const s of sources) for (const raw of s.tags ?? []) {
    const t = String(raw).toLowerCase().trim()
    if (t && !seen.has(t)) { seen.add(t); out.push(t) }
  }
  return out
}

// ── source text assembly (OQ7 cap) ─────────────────────────────────────────────

/**
 * Concatenate the source bodies into one labeled block for the model, bounded
 * by `cap` total characters. Truncation is per-source-proportional-free: we
 * append whole sources until the cap would be exceeded, then hard-cut the last
 * one and stop. Returns `truncated` so the caller can warn.
 */
export function assembleSourceText(
  sources: MergeSource[],
  cap: number = MERGE_CHAR_CAP,
): { text: string; truncated: boolean } {
  let text = ''
  let truncated = false
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i]
    const header = `\n\n===== SOURCE ${i + 1}: ${s.title ?? '(untitled)'} [${s.kind}] =====\n`
    const bodyText = s.body ?? '(no body)'
    const remaining = cap - text.length - header.length
    if (remaining <= 0) { truncated = true; break }
    if (bodyText.length > remaining) {
      text += header + bodyText.slice(0, remaining) + '\n…[truncated]'
      truncated = true
      break
    }
    text += header + bodyText
  }
  return { text: text.trim(), truncated }
}

// ── prompt + response parsing ───────────────────────────────────────────────────

const BODY_DELIM = '---BODY---'

export function buildMergePrompt(assembledSourceText: string): string {
  return `You are merging two or more knowledge-base entries into a SINGLE entry.

Rules (a "lossless union"):
1. Include EVERY distinct fact, point, list item, and section from each source. Drop nothing unique.
2. De-duplicate content that appears in more than one source — say it once.
3. When two sources CONTRADICT each other, keep BOTH claims and record the contradiction in a trailing markdown section titled "## Source notes & conflicts". Never silently pick one.
4. Produce clean, well-structured Markdown. Use the existing headings/structure where it helps.

Output EXACTLY this format and nothing else:
TITLE: <a concise title for the merged entry, max 80 chars>
TYPE: <one of: ${MERGE_TYPE_HINTS.join(', ')}>
${BODY_DELIM}
<the full merged Markdown body>

The sources:
${assembledSourceText}`
}

/**
 * Parse the model's `TITLE/TYPE/---BODY---` response. Lenient: if the delimiter
 * is missing, treats the whole response as the body and derives a title.
 */
export function parseMergeResponse(raw: string): MergeDraftBody {
  const text = (raw ?? '').trim()
  const idx = text.indexOf(BODY_DELIM)
  let header = ''
  let body = ''
  if (idx === -1) {
    body = text
  } else {
    header = text.slice(0, idx)
    body = text.slice(idx + BODY_DELIM.length).trim()
  }

  const titleMatch = header.match(/^\s*TITLE:\s*(.+)$/im)
  const typeMatch = header.match(/^\s*TYPE:\s*(.+)$/im)

  let title = titleMatch ? titleMatch[1].trim() : ''
  if (!title) {
    const firstLine = body.split('\n').find(l => l.trim().length > 0) ?? 'Merged entry'
    title = firstLine.replace(/^#+\s*/, '').trim()
  }
  title = title.slice(0, 120)

  const rawType = typeMatch ? typeMatch[1].trim().toLowerCase() : ''
  const type_hint: MergeTypeHint =
    (MERGE_TYPE_HINTS as readonly string[]).includes(rawType) ? (rawType as MergeTypeHint) : 'strategy'

  return { title, type_hint, body: body || '(empty)' }
}

/**
 * Deterministic merge used when no Anthropic key is configured: each source as
 * its own section, plus a note that this was assembled without AI.
 */
export function fallbackMergeDraft(sources: MergeSource[]): MergeDraftBody {
  const { text } = assembleSourceText(sources)
  const titles = sources.map(s => s.title ?? '(untitled)')
  const body =
    `> Assembled without AI (no model key configured) — review and de-duplicate manually.\n\n` +
    sources.map((s, i) =>
      `## ${s.title ?? `Source ${i + 1}`}\n\n${s.body ?? '(no body)'}`,
    ).join('\n\n---\n\n')
  return {
    title: `Merged: ${titles.join(' + ')}`.slice(0, 120),
    type_hint: 'strategy',
    // `text` is referenced to keep assembly + fallback consistent for callers
    // that want the capped concatenation; the per-section body is friendlier.
    body: body || text || '(empty)',
  }
}

// ── workspace re-parenting (OQ3 = anything incl. workspace) ─────────────────────

/** True if any source is a workspace page (forces merged kind = workspace). */
export function hasWorkspaceSource(sources: MergeSource[]): boolean {
  return sources.some(s => s.kind === 'workspace')
}

/**
 * Final kind of the merged result. If any source is a workspace page the result
 * MUST be a workspace page (so it can hold the re-parented child subtree);
 * otherwise the (validated) suggested kind is used, defaulting to 'doc'.
 */
export function resolveMergeKind(sources: MergeSource[], suggested?: string | null): MergeKind {
  if (hasWorkspaceSource(sources)) return 'workspace'
  if (suggested && (MERGE_KINDS as readonly string[]).includes(suggested)) return suggested as MergeKind
  return 'doc'
}

/**
 * The merged workspace page inherits a parent only when ALL workspace sources
 * share one common parent (and it isn't itself a source). Otherwise it becomes
 * a top-level page (null). Non-workspace merges always return null.
 */
export function resolveMergeParentId(sources: MergeSource[]): string | null {
  const ws = sources.filter(s => s.kind === 'workspace')
  if (ws.length === 0) return null
  const sourceIds = new Set(sources.map(s => s.id))
  const parents = new Set(ws.map(s => s.parent_id ?? '__none__'))
  if (parents.size !== 1) return null
  const only = ws[0].parent_id
  if (!only || sourceIds.has(only)) return null
  return only
}

/**
 * Granola integration — client foundation (Sprint 13).
 *
 * Foundation only: key reader + a thin REST client + types. The actual
 * Granola → triage-inbox importer is built next session and will mirror the
 * bulk importer (api/knowledge/import.ts): for each note, insertInboxEntry with
 *   source: 'granola',
 *   externalSource: 'granola', externalRef: <note id>,
 *   externalLastEditedAt: <note updated_at>
 * so re-runs are non-destructive (dedupe on the (org, source, ref) unique index;
 * a re-pulled note that's already been filed is left alone).
 *
 * API (public, confirmed against docs.granola.ai):
 *   Base    https://public-api.granola.ai/v1
 *   Auth    Authorization: Bearer grn_…
 *   List    GET /notes?created_after=<ISO>&cursor=<cursor>  → { notes, hasMore, cursor }
 *   Detail  GET /notes/{id}  (summary + transcript)
 *
 * The token is a Vercel env var (GRANOLA_API_KEY) — never stored in the DB.
 */

export const GRANOLA_API_BASE =
  process.env.GRANOLA_API_BASE?.replace(/\/+$/, '') || 'https://public-api.granola.ai/v1'

/** Resolve the Granola API key from the environment (Vercel: GRANOLA_API_KEY). */
export function getGranolaApiKey(): string | undefined {
  return process.env.GRANOLA_API_KEY || undefined
}

export function isGranolaConfigured(): boolean {
  return !!getGranolaApiKey()
}

export interface GranolaNote {
  id: string
  title: string | null
  created_at: string | null
  updated_at: string | null
}

export interface GranolaNotesPage {
  notes: GranolaNote[]
  hasMore: boolean
  cursor: string | null
}

/** Authenticated GET against the Granola REST API. */
export async function granolaFetch(
  path: string,
  key: string,
  params: Record<string, string | undefined> = {},
): Promise<Response> {
  const url = new URL(GRANOLA_API_BASE + path)
  for (const [k, v] of Object.entries(params)) if (v != null && v !== '') url.searchParams.set(k, v)
  return fetch(url.toString(), {
    headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
  })
}

/** List meeting notes (one page). The importer will paginate via the cursor. */
export async function listGranolaNotes(opts: {
  key: string
  createdAfter?: string
  cursor?: string
}): Promise<GranolaNotesPage> {
  const res = await granolaFetch('/notes', opts.key, {
    created_after: opts.createdAfter,
    cursor: opts.cursor,
  })
  if (!res.ok) throw new Error(`Granola API ${res.status}`)
  const data = await res.json().catch(() => ({}))
  // Be tolerant of the array key (notes / data) while the importer is unbuilt.
  const rows: any[] = Array.isArray(data?.notes) ? data.notes : Array.isArray(data?.data) ? data.data : []
  return {
    notes: rows.map((n) => ({
      id: String(n.id ?? n.note_id ?? ''),
      title: n.title ?? n.name ?? null,
      created_at: n.created_at ?? null,
      updated_at: n.updated_at ?? n.last_edited_at ?? null,
    })),
    hasMore: !!data?.hasMore,
    cursor: data?.cursor ?? null,
  }
}

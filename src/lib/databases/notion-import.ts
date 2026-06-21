// HQ Databases — Notion → HQ mapping (Phase B2).
//
// PURE layer for the Notion-API importer: parse a Notion database reference,
// map a Notion database schema to HQ properties, and extract each row's cell
// values into the JSONB shape `hq_db_records.values` expects. No I/O, no React
// — fully unit-testable. The orchestrator (src/app/api/knowledge/database-import.ts)
// does the network fetches + Supabase writes and remaps property ids.
//
// Type map is the spec §5 table (docs/specs/hq_databases_v1.html):
//   title→text(is_title) · rich_text→text · select/status→same · multi_select→same
//   number/checkbox/date/url→same · relation→relation (raw page ids; resolved
//   only when the target db is also imported) · formula/rollup/everything-else
//   → text (read-only snapshot of the current value).

import type { DbPropertyType, DbPropertyConfig, DbSelectOption } from './types'

export const NOTION_VERSION = '2022-06-28'

// ── reference parsing ────────────────────────────────────────────────────────

/**
 * Pull a Notion database id out of a URL, an id, or a dashed UUID.
 *
 * Notion DB URLs look like `https://www.notion.so/My-DB-<32hex>?v=<32hex>`.
 * The trailing path id is the database; the `?v=` query is a *view* id and must
 * be ignored. We strip the query, then take the last 32-hex run in the path and
 * dash-format it to a UUID (the Notion API accepts either form).
 */
export function parseNotionDatabaseId(input: string): string {
  if (!input || typeof input !== 'string') throw new Error('A Notion database URL or id is required.')
  // Drop query + fragment so the `?v=<viewId>` can never be mistaken for the db id.
  const path = input.trim().split(/[?#]/)[0]
  // A dashed UUID, or a bare 32-hex run (Notion's URL form).
  const matches = path.match(
    /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32}/g,
  )
  if (!matches || matches.length === 0) {
    throw new Error('Could not find a Notion database id in that URL. Paste the database link (it ends in a 32-character id).')
  }
  return dashifyId(matches[matches.length - 1])
}

/** 32 hex chars → 8-4-4-4-12 dashed UUID (idempotent if already dashed-in). */
function dashifyId(hex32: string): string {
  const h = hex32.replace(/-/g, '').toLowerCase()
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`
}

// ── type mapping ─────────────────────────────────────────────────────────────

const DIRECT_TYPE: Record<string, DbPropertyType> = {
  title: 'text',
  rich_text: 'text',
  select: 'select',
  status: 'status',
  multi_select: 'multi_select',
  number: 'number',
  checkbox: 'checkbox',
  date: 'date',
  url: 'url',
  relation: 'relation',
  // Clean structural maps that don't lose data:
  email: 'text',
  phone_number: 'text',
  created_time: 'date',
  last_edited_time: 'date',
}

/**
 * Map a Notion property type to an HQ type. `unmapped` flags the types HQ can't
 * represent faithfully (formula/rollup/people/files/…) — they import as a
 * read-only text snapshot of their current value and are surfaced in the report.
 */
export function mapNotionType(notionType: string): { type: DbPropertyType; unmapped: boolean } {
  const direct = DIRECT_TYPE[notionType]
  if (direct) return { type: direct, unmapped: false }
  return { type: 'text', unmapped: true }
}

/** Notion colors come through as e.g. `blue` or `blue_background`; format.ts only
 *  knows the base names, so strip the `_background` suffix. */
export function notionColorToHq(color?: string): string | undefined {
  if (!color) return undefined
  return color.replace(/_background$/, '')
}

// ── schema mapping ───────────────────────────────────────────────────────────

export interface PreparedProperty {
  notionId: string
  notionType: string
  name: string
  type: DbPropertyType
  position: number
  config: DbPropertyConfig
  is_title: boolean
  unmapped: boolean
}

export interface MappedSchema {
  title: string
  icon: string | null
  description: string | null
  properties: PreparedProperty[]
  unmappedColumns: { name: string; notionType: string }[]
}

/** A minimal shape of the Notion database object we read. */
interface NotionDatabase {
  title?: { plain_text?: string }[]
  description?: { plain_text?: string }[]
  icon?: { type?: string; emoji?: string } | null
  properties?: Record<string, NotionSchemaProperty>
}

interface NotionSchemaProperty {
  id: string
  name?: string
  type: string
  select?: { options?: { name: string; color?: string }[] }
  status?: { options?: { name: string; color?: string }[] }
  multi_select?: { options?: { name: string; color?: string }[] }
  relation?: { database_id?: string }
  number?: { format?: string }
}

function richTextToPlain(rt?: { plain_text?: string }[]): string {
  if (!Array.isArray(rt)) return ''
  return rt.map((t) => t?.plain_text ?? '').join('')
}

function optionsFrom(opts?: { name: string; color?: string }[]): DbSelectOption[] {
  return (opts ?? []).map((o) => {
    const color = notionColorToHq(o.color)
    return color ? { name: o.name, color } : { name: o.name }
  })
}

/**
 * Map a Notion database object → HQ schema. Properties keep Notion's key order
 * (positions 0..n-1); the `title` property is flagged `is_title`. Notion
 * guarantees exactly one title property and unique property names per database.
 */
export function mapDatabaseSchema(db: NotionDatabase): MappedSchema {
  const title = richTextToPlain(db.title) || 'Untitled database'
  const icon = db.icon?.type === 'emoji' ? db.icon.emoji ?? null : null
  const description = richTextToPlain(db.description).trim() || null

  const entries = Object.entries(db.properties ?? {})
  const properties: PreparedProperty[] = []
  const unmappedColumns: { name: string; notionType: string }[] = []

  entries.forEach(([name, prop], i) => {
    const { type, unmapped } = mapNotionType(prop.type)
    const config: DbPropertyConfig = {}
    if (type === 'select' || type === 'status') {
      config.options = optionsFrom((prop.select ?? prop.status)?.options)
    } else if (type === 'multi_select') {
      config.options = optionsFrom(prop.multi_select?.options)
    } else if (type === 'relation' && prop.relation?.database_id) {
      config.notionRelationDatabaseId = prop.relation.database_id
    }
    if (unmapped) config.importedFromNotionType = prop.type

    properties.push({
      notionId: prop.id,
      notionType: prop.type,
      name: prop.name ?? name,
      type,
      position: i,
      config,
      is_title: prop.type === 'title',
      unmapped,
    })
    if (unmapped) unmappedColumns.push({ name: prop.name ?? name, notionType: prop.type })
  })

  return { title, icon, description, properties, unmappedColumns }
}

// ── value extraction ─────────────────────────────────────────────────────────

/** A Notion page property *value* (keyed by name in page.properties). */
interface NotionPropertyValue {
  type: string
  title?: { plain_text?: string }[]
  rich_text?: { plain_text?: string }[]
  select?: { name?: string } | null
  status?: { name?: string } | null
  multi_select?: { name?: string }[]
  number?: number | null
  checkbox?: boolean
  date?: { start?: string; end?: string } | null
  url?: string | null
  email?: string | null
  phone_number?: string | null
  relation?: { id: string }[]
  people?: { name?: string }[]
  files?: { name?: string }[]
  created_time?: string
  last_edited_time?: string
  created_by?: { name?: string } | null
  last_edited_by?: { name?: string } | null
  formula?: { type?: string; string?: string | null; number?: number | null; boolean?: boolean | null; date?: { start?: string } | null }
  rollup?: { type?: string; number?: number | null; date?: { start?: string } | null; array?: unknown[]; string?: string | null }
  unique_id?: { prefix?: string | null; number?: number | null }
}

/**
 * Extract a single cell value into the JSONB-storable form HQ keeps. Returns
 * `null` for empty/missing so format.ts renders an em-dash. Unmappable types
 * (formula/rollup/people/…) collapse to a text snapshot of their current value.
 */
export function extractCellValue(pv: NotionPropertyValue | undefined): unknown {
  if (!pv) return null
  switch (pv.type) {
    case 'title':
      return richTextToPlain(pv.title) || null
    case 'rich_text':
      return richTextToPlain(pv.rich_text) || null
    case 'select':
      return pv.select?.name ?? null
    case 'status':
      return pv.status?.name ?? null
    case 'multi_select':
      return (pv.multi_select ?? []).map((o) => o.name ?? '').filter(Boolean)
    case 'number':
      return typeof pv.number === 'number' ? pv.number : null
    case 'checkbox':
      return pv.checkbox === true
    case 'date':
      return pv.date?.start ?? null
    case 'url':
      return pv.url ?? null
    case 'email':
      return pv.email ?? null
    case 'phone_number':
      return pv.phone_number ?? null
    case 'relation':
      // Raw related page ids — resolved to HQ records only when the target db is
      // also imported (B3/batch). Stored so nothing is lost.
      return (pv.relation ?? []).map((r) => r.id)
    case 'created_time':
      return pv.created_time ?? null
    case 'last_edited_time':
      return pv.last_edited_time ?? null
    case 'people':
      return (pv.people ?? []).map((p) => p.name ?? '').filter(Boolean).join(', ') || null
    case 'files':
      return (pv.files ?? []).map((f) => f.name ?? '').filter(Boolean).join(', ') || null
    case 'created_by':
      return pv.created_by?.name ?? null
    case 'last_edited_by':
      return pv.last_edited_by?.name ?? null
    case 'unique_id': {
      if (!pv.unique_id) return null
      const { prefix, number } = pv.unique_id
      if (number == null) return null
      return prefix ? `${prefix}-${number}` : String(number)
    }
    case 'formula':
      return formulaSnapshot(pv.formula)
    case 'rollup':
      return rollupSnapshot(pv.rollup)
    default:
      return null
  }
}

function formulaSnapshot(f?: NotionPropertyValue['formula']): unknown {
  if (!f) return null
  switch (f.type) {
    case 'string':
      return f.string ?? null
    case 'number':
      return typeof f.number === 'number' ? String(f.number) : null
    case 'boolean':
      return f.boolean == null ? null : f.boolean ? 'Yes' : 'No'
    case 'date':
      return f.date?.start ?? null
    default:
      return null
  }
}

function rollupSnapshot(r?: NotionPropertyValue['rollup']): unknown {
  if (!r) return null
  switch (r.type) {
    case 'number':
      return typeof r.number === 'number' ? String(r.number) : null
    case 'date':
      return r.date?.start ?? null
    case 'string':
      return r.string ?? null
    case 'array':
      return (r.array ?? []).map((e) => snapshotArrayEntry(e)).filter(Boolean).join(', ') || null
    default:
      return null
  }
}

function snapshotArrayEntry(e: unknown): string {
  const v = extractCellValue(e as NotionPropertyValue)
  if (v == null) return ''
  return Array.isArray(v) ? v.join(', ') : String(v)
}

/**
 * Map a Notion page → record values keyed by the *Notion* property id. The
 * orchestrator remaps Notion ids → HQ property ids after the columns are
 * inserted. Empty cells are omitted (sparse JSONB).
 */
export function mapRecordValues(
  page: { properties?: Record<string, NotionPropertyValue> },
  props: PreparedProperty[],
): Record<string, unknown> {
  const pageProps = page.properties ?? {}
  const out: Record<string, unknown> = {}
  for (const p of props) {
    const pv = pageProps[p.name]
    const value = extractCellValue(pv)
    if (value === null || (Array.isArray(value) && value.length === 0)) continue
    out[p.notionId] = value
  }
  return out
}

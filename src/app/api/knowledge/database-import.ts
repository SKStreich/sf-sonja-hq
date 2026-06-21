'use server'
/**
 * HQ Databases — Notion-API importer (Phase B2).
 *
 * Given a Notion database URL + a read-only Notion integration token, recreate
 * the database's schema + all rows in HQ as a real `hq_databases` record set.
 * Writes go through the caller's RLS-scoped client (org from user_profiles,
 * created_by from the auth user) — the same path B3's in-app editor will use,
 * so no service role is involved.
 *
 * OQ-4 (manual import): the token is passed per-call and NOT persisted. OQ-6:
 * imported databases default to entity `tm`. Pure mapping lives in
 * src/lib/databases/notion-import.ts; this file is the network + DB plumbing.
 */
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import {
  NOTION_VERSION,
  parseNotionDatabaseId,
  mapDatabaseSchema,
  mapRecordValues,
} from '@/lib/databases/notion-import'

export interface ImportNotionArgs {
  url: string
  token: string
  /** Entity slug for the new database. Defaults to `tm` (OQ-6). */
  entity?: string
}

export interface ImportNotionReport {
  databaseId: string
  title: string
  recordCount: number
  propertyCount: number
  unmappedColumns: { name: string; notionType: string }[]
}

const NOTION_API = 'https://api.notion.com/v1'

async function notionFetch(path: string, token: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${NOTION_API}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 401) throw new Error('Notion rejected the token (401). Check the integration token.')
    if (res.status === 404) {
      throw new Error('Notion returned 404 — the database exists but the integration may not be shared with it. In Notion: open the database → ••• → Connections → add your integration.')
    }
    throw new Error(`Notion API error ${res.status}: ${body.slice(0, 300)}`)
  }
  return res.json()
}

/** Fetch every row-page of a database, following pagination. */
async function fetchAllRows(databaseId: string, token: string): Promise<{ properties?: Record<string, any> }[]> {
  const pages: { properties?: Record<string, any> }[] = []
  let cursor: string | undefined
  // Bound the loop so a misbehaving API can't spin forever.
  for (let guard = 0; guard < 200; guard++) {
    const body: Record<string, unknown> = { page_size: 100 }
    if (cursor) body.start_cursor = cursor
    const resp = await notionFetch(`databases/${databaseId}/query`, token, {
      method: 'POST',
      body: JSON.stringify(body),
    })
    pages.push(...(resp.results ?? []))
    if (!resp.has_more) break
    cursor = resp.next_cursor
    if (!cursor) break
  }
  return pages
}

export async function importNotionDatabase(args: ImportNotionArgs): Promise<ImportNotionReport> {
  const token = args.token?.trim()
  if (!token) throw new Error('A Notion integration token is required.')
  const databaseId = parseNotionDatabaseId(args.url)
  const entity = args.entity?.trim() || 'tm'

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await (supabase as any)
    .from('user_profiles').select('org_id').eq('id', user.id).single()
  if (!profile) throw new Error('No profile found')
  const org_id = profile.org_id as string

  // 1 — fetch + map the schema.
  const notionDb = await notionFetch(`databases/${databaseId}`, token)
  const schema = mapDatabaseSchema(notionDb)
  if (schema.properties.length === 0) {
    throw new Error('That Notion database has no columns to import.')
  }

  // 2 — create the database row.
  const { data: dbRow, error: dbErr } = await (supabase as any)
    .from('hq_databases')
    .insert({
      org_id,
      created_by: user.id,
      title: schema.title,
      icon: schema.icon,
      description: schema.description,
    })
    .select('id')
    .single()
  if (dbErr) throw new Error(`Could not create the database: ${dbErr.message ?? dbErr}`)
  const hqDbId = dbRow.id as string

  // 3 — entity tag (OQ-6 default `tm`).
  const { error: entErr } = await (supabase as any)
    .from('hq_db_entities')
    .insert({ database_id: hqDbId, entity, org_id })
  if (entErr) throw new Error(`Could not tag the database entity: ${entErr.message ?? entErr}`)

  // 4 — insert columns, then map Notion property id → HQ property id by position
  //     (positions are unique 0..n-1, so they're a stable join key).
  const propRows = schema.properties.map((p) => ({
    database_id: hqDbId,
    name: p.name,
    type: p.type,
    position: p.position,
    config: p.config,
    is_title: p.is_title,
  }))
  const { data: insertedProps, error: propErr } = await (supabase as any)
    .from('hq_db_properties')
    .insert(propRows)
    .select('id, position')
  if (propErr) throw new Error(`Could not create columns: ${propErr.message ?? propErr}`)

  const hqIdByPosition = new Map<number, string>()
  for (const r of insertedProps as { id: string; position: number }[]) {
    hqIdByPosition.set(r.position, r.id)
  }
  const notionIdToHq = new Map<string, string>()
  for (const p of schema.properties) {
    const hqId = hqIdByPosition.get(p.position)
    if (hqId) notionIdToHq.set(p.notionId, hqId)
  }

  // 5 — fetch all rows, map each to record values (keyed by Notion id → HQ id).
  const pages = await fetchAllRows(databaseId, token)
  const recordRows = pages.map((page, i) => {
    const byNotionId = mapRecordValues(page, schema.properties)
    const values: Record<string, unknown> = {}
    for (const [notionId, val] of Object.entries(byNotionId)) {
      const hqId = notionIdToHq.get(notionId)
      if (hqId) values[hqId] = val
    }
    return { database_id: hqDbId, position: i, values }
  })

  // 6 — insert records in chunks (keeps the request body bounded).
  for (let i = 0; i < recordRows.length; i += 500) {
    const { error } = await (supabase as any)
      .from('hq_db_records')
      .insert(recordRows.slice(i, i + 500))
    if (error) throw new Error(`Could not import rows: ${error.message ?? error}`)
  }

  revalidatePath('/dashboard/knowledge')

  return {
    databaseId: hqDbId,
    title: schema.title,
    recordCount: recordRows.length,
    propertyCount: schema.properties.length,
    unmappedColumns: schema.unmappedColumns,
  }
}

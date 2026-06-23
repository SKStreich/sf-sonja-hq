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
  matchRecordsToPageIds,
  notionPageTitle,
} from '@/lib/databases/notion-import'
import { recordTitle } from '@/lib/databases/format'
import type { DbProperty, DbRecord } from '@/lib/databases/types'

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

interface NotionPage { id?: string; properties?: Record<string, any> }

/** Fetch every row-page of a database, following pagination. */
async function fetchAllRows(databaseId: string, token: string): Promise<NotionPage[]> {
  const pages: NotionPage[] = []
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

  // 2 — create the database row. Record the source Notion db id so relation
  //     columns in OTHER databases that point here can resolve to this HQ db.
  const { data: dbRow, error: dbErr } = await (supabase as any)
    .from('hq_databases')
    .insert({
      org_id,
      created_by: user.id,
      title: schema.title,
      icon: schema.icon,
      description: schema.description,
      notion_database_id: databaseId,
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
  //     Resolve relation targets: if a relation's target Notion db is already an
  //     HQ database, pin its HQ id so the cell resolves without a Notion lookup.
  const targetNotionDbIds = Array.from(
    new Set(
      schema.properties
        .map((p) => p.config.notionRelationDatabaseId)
        .filter((v): v is string => typeof v === 'string'),
    ),
  )
  const hqDbByNotionDb = new Map<string, string>()
  if (targetNotionDbIds.length > 0) {
    const { data: targets } = await (supabase as any)
      .from('hq_databases')
      .select('id, notion_database_id')
      .in('notion_database_id', targetNotionDbIds)
    for (const t of (targets ?? []) as { id: string; notion_database_id: string }[]) {
      hqDbByNotionDb.set(t.notion_database_id, t.id)
    }
  }

  const propRows = schema.properties.map((p) => {
    const config: Record<string, unknown> = { ...p.config }
    const targetHq = p.config.notionRelationDatabaseId
      ? hqDbByNotionDb.get(p.config.notionRelationDatabaseId)
      : undefined
    if (targetHq) config.relationDatabaseId = targetHq
    return {
      database_id: hqDbId,
      name: p.name,
      type: p.type,
      position: p.position,
      config,
      is_title: p.is_title,
    }
  })
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
    return { database_id: hqDbId, position: i, values, notion_page_id: page.id ?? null }
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

export interface BackfillPageIdsArgs {
  /** The HQ database to patch (it was imported before page ids were captured). */
  databaseId: string
  /** The source Notion database URL or id to re-fetch page ids from. */
  url: string
  token: string
}

export interface BackfillPageIdsReport {
  total: number
  matched: number
  unmatched: number
  unmatchedTitles: string[]
}

/**
 * One-time recovery for databases imported before U3d: re-fetch the source Notion
 * database, match each row to its HQ record by title, and patch the HQ record's
 * `notion_page_id` (plus the database's `notion_database_id`). Afterwards, any
 * relation column elsewhere that references this database's pages resolves to
 * record titles. The token is per-call and not persisted (mirrors the importer).
 */
export async function backfillNotionPageIds(args: BackfillPageIdsArgs): Promise<BackfillPageIdsReport> {
  const token = args.token?.trim()
  if (!token) throw new Error('A Notion integration token is required.')
  if (!args.databaseId) throw new Error('A database is required.')
  const notionDbId = parseNotionDatabaseId(args.url)

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  // Load the HQ schema + records (RLS-scoped to the caller's org).
  const [{ data: db }, { data: props }, { data: recs }] = await Promise.all([
    (supabase as any).from('hq_databases').select('id').eq('id', args.databaseId).maybeSingle(),
    (supabase as any).from('hq_db_properties').select('*').eq('database_id', args.databaseId),
    (supabase as any).from('hq_db_records').select('*').eq('database_id', args.databaseId),
  ])
  if (!db) throw new Error('Database not found.')
  const properties = (props ?? []) as DbProperty[]
  const records = (recs ?? []) as DbRecord[]

  // Re-fetch Notion pages → (id, title), then match by title.
  const pages = await fetchAllRows(notionDbId, token)
  const notionPages = pages
    .filter((p) => p.id)
    .map((p) => ({ id: p.id as string, title: notionPageTitle(p) }))
  const hqRecords = records.map((r) => ({ id: r.id, title: recordTitle(properties, r) }))
  const { pageIdByRecordId, unmatchedRecordTitles } = matchRecordsToPageIds(hqRecords, notionPages)

  // Persist: the database's source Notion id + each matched record's page id.
  await (supabase as any)
    .from('hq_databases')
    .update({ notion_database_id: notionDbId })
    .eq('id', args.databaseId)

  const entries = Object.entries(pageIdByRecordId)
  for (const [recordId, pageId] of entries) {
    const { error } = await (supabase as any)
      .from('hq_db_records')
      .update({ notion_page_id: pageId })
      .eq('id', recordId)
    if (error) throw new Error(`Could not update a record: ${error.message ?? error}`)
  }

  revalidatePath('/dashboard/knowledge')

  return {
    total: records.length,
    matched: entries.length,
    unmatched: unmatchedRecordTitles.length,
    unmatchedTitles: unmatchedRecordTitles,
  }
}

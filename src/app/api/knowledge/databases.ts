'use server'
/**
 * HQ Databases — read access (Phase B1).
 *
 * Notion-parity "databases": typed records under an org + entity set. B1 is
 * READ-ONLY — these two readers back the Databases tab's list + table view.
 * In-app row/column editing and the Notion importer are B2/B3.
 *
 * All access is org-scoped by RLS (hq_databases_tenant_isolation +
 * the child-table policies); these readers add no extra org filtering.
 */
import { createClient } from '@/lib/supabase/server'
import { sortEntitySlugs } from '@/lib/entities/multi-entity'
import type { HqDatabase, DbProperty, DbRecord, DatabaseDetail } from '@/lib/databases/types'

/** List the org's databases (RLS-scoped), newest-touched first, with entity
 *  tags + a record count for the list view. */
export async function listDatabases(): Promise<HqDatabase[]> {
  const supabase = createClient()

  const { data: dbs, error } = await (supabase as any)
    .from('hq_databases')
    .select('id, org_id, title, icon, description, created_by, created_at, updated_at')
    .order('updated_at', { ascending: false })
  if (error) throw error

  const rows = (dbs ?? []) as Omit<HqDatabase, 'entities'>[]
  if (rows.length === 0) return []
  const ids = rows.map((d) => d.id)

  const [{ data: ents }, { data: recs }] = await Promise.all([
    (supabase as any).from('hq_db_entities').select('database_id, entity').in('database_id', ids),
    (supabase as any).from('hq_db_records').select('database_id').in('database_id', ids),
  ])

  const entityMap = new Map<string, string[]>()
  for (const e of (ents ?? []) as { database_id: string; entity: string }[]) {
    const arr = entityMap.get(e.database_id) ?? []
    arr.push(e.entity)
    entityMap.set(e.database_id, arr)
  }
  const countMap = new Map<string, number>()
  for (const r of (recs ?? []) as { database_id: string }[]) {
    countMap.set(r.database_id, (countMap.get(r.database_id) ?? 0) + 1)
  }

  return rows.map((d) => ({
    ...d,
    entities: sortEntitySlugs(entityMap.get(d.id) ?? []),
    record_count: countMap.get(d.id) ?? 0,
  }))
}

/** Full detail for one database: its schema (properties) + rows (records). */
export async function getDatabaseDetail(id: string): Promise<DatabaseDetail | null> {
  const supabase = createClient()

  const [{ data: db, error: dbErr }, { data: props }, { data: records }, { data: ents }] =
    await Promise.all([
      (supabase as any)
        .from('hq_databases')
        .select('id, org_id, title, icon, description, created_by, created_at, updated_at')
        .eq('id', id)
        .maybeSingle(),
      (supabase as any).from('hq_db_properties').select('*').eq('database_id', id).order('position'),
      (supabase as any).from('hq_db_records').select('*').eq('database_id', id).order('position'),
      (supabase as any).from('hq_db_entities').select('entity').eq('database_id', id),
    ])
  if (dbErr) throw dbErr
  if (!db) return null

  return {
    database: {
      ...(db as Omit<HqDatabase, 'entities'>),
      entities: sortEntitySlugs(((ents ?? []) as { entity: string }[]).map((e) => e.entity)),
    },
    properties: (props ?? []) as DbProperty[],
    records: (records ?? []) as DbRecord[],
  }
}

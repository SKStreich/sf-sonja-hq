'use server'
/**
 * HQ Databases — in-app row/column editing (Phase U3a).
 *
 * The write half of the Databases primitive (B1 shipped read-only; U2 added
 * CSV download). All writes go through the caller's RLS-scoped client —
 * hq_databases_tenant_isolation + the child-table FOR ALL policies already
 * gate every table by org (no extra org filter needed here). Pure value/column
 * normalization lives in @/lib/databases/edit so the rules are unit-tested.
 *
 * No migration: B1 installed full FOR ALL policies up front for exactly this.
 */
import { createClient } from '@/lib/supabase/server'
import { getDatabaseDetail } from './databases'
import {
  parseCellInput,
  normalizePropertyInput,
  nextPosition,
} from '@/lib/databases/edit'
import type { DatabaseDetail, DbProperty, DbSelectOption } from '@/lib/databases/types'

/** Bump the parent database's updated_at so an edited db sorts to the top of
 *  the list (and the list-view "touched" order stays meaningful). */
async function touchDatabase(supabase: ReturnType<typeof createClient>, databaseId: string) {
  await (supabase as any)
    .from('hq_databases')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', databaseId)
}

/** Re-read full detail after a mutation so the client can re-render from one
 *  authoritative shape (RLS-scoped). Throws if the db vanished mid-edit. */
async function detailOrThrow(databaseId: string): Promise<DatabaseDetail> {
  const detail = await getDatabaseDetail(databaseId)
  if (!detail) throw new Error('Database not found.')
  return detail
}

// ── Records (rows) ───────────────────────────────────────────────────────────

/** Append an empty row to a database. */
export async function addRecord(databaseId: string): Promise<DatabaseDetail> {
  const supabase = createClient()
  const { data: existing } = await (supabase as any)
    .from('hq_db_records')
    .select('position')
    .eq('database_id', databaseId)
  const position = nextPosition((existing ?? []) as { position: number }[])

  const { error } = await (supabase as any)
    .from('hq_db_records')
    .insert({ database_id: databaseId, position, values: {} })
  if (error) throw error
  await touchDatabase(supabase, databaseId)
  return detailOrThrow(databaseId)
}

/** Update one cell (property value) on a row. `raw` is the editor's raw input;
 *  it's typed/normalized via parseCellInput before being merged into values. */
export async function updateCell(
  databaseId: string,
  recordId: string,
  property: Pick<DbProperty, 'id' | 'type'>,
  raw: unknown,
): Promise<DatabaseDetail> {
  const supabase = createClient()
  const { data: rec, error: readErr } = await (supabase as any)
    .from('hq_db_records')
    .select('values')
    .eq('id', recordId)
    .maybeSingle()
  if (readErr) throw readErr
  if (!rec) throw new Error('Row not found.')

  const values = { ...((rec.values ?? {}) as Record<string, unknown>) }
  const parsed = parseCellInput(property.type, raw)
  // null / empty array clears the cell (drop the key to keep JSONB tidy).
  if (parsed === null || (Array.isArray(parsed) && parsed.length === 0)) {
    delete values[property.id]
  } else {
    values[property.id] = parsed
  }

  const { error } = await (supabase as any)
    .from('hq_db_records')
    .update({ values, updated_at: new Date().toISOString() })
    .eq('id', recordId)
  if (error) throw error
  await touchDatabase(supabase, databaseId)
  return detailOrThrow(databaseId)
}

/** Delete a row. */
export async function deleteRecord(databaseId: string, recordId: string): Promise<DatabaseDetail> {
  const supabase = createClient()
  const { error } = await (supabase as any).from('hq_db_records').delete().eq('id', recordId)
  if (error) throw error
  await touchDatabase(supabase, databaseId)
  return detailOrThrow(databaseId)
}

// ── Properties (columns) ───────────────────────────────────────────────────────

/** Append a column. The first column ever added to an empty database becomes
 *  the title column (every db needs exactly one). */
export async function addProperty(
  databaseId: string,
  input: { name: string; type: string; options?: DbSelectOption[] },
): Promise<DatabaseDetail> {
  const supabase = createClient()
  const normalized = normalizePropertyInput(input)

  const { data: existing } = await (supabase as any)
    .from('hq_db_properties')
    .select('position, is_title')
    .eq('database_id', databaseId)
  const rows = (existing ?? []) as { position: number; is_title: boolean }[]
  const position = nextPosition(rows)
  const hasTitle = rows.some((r) => r.is_title)

  const { error } = await (supabase as any).from('hq_db_properties').insert({
    database_id: databaseId,
    name: normalized.name,
    type: normalized.type,
    position,
    config: normalized.config,
    is_title: !hasTitle, // first-ever column is the title
  })
  if (error) throw error
  await touchDatabase(supabase, databaseId)
  return detailOrThrow(databaseId)
}

/** Rename / retype an existing column (the title flag is not changed here). */
export async function updateProperty(
  databaseId: string,
  propertyId: string,
  input: { name: string; type: string; options?: DbSelectOption[] },
): Promise<DatabaseDetail> {
  const supabase = createClient()
  const normalized = normalizePropertyInput(input)
  const { error } = await (supabase as any)
    .from('hq_db_properties')
    .update({ name: normalized.name, type: normalized.type, config: normalized.config })
    .eq('id', propertyId)
  if (error) throw error
  await touchDatabase(supabase, databaseId)
  return detailOrThrow(databaseId)
}

/** Delete a column. Refuses to delete the title column (a db must keep one). */
export async function deleteProperty(databaseId: string, propertyId: string): Promise<DatabaseDetail> {
  const supabase = createClient()
  const { data: prop, error: readErr } = await (supabase as any)
    .from('hq_db_properties')
    .select('is_title')
    .eq('id', propertyId)
    .maybeSingle()
  if (readErr) throw readErr
  if (!prop) throw new Error('Column not found.')
  if (prop.is_title) throw new Error('The title column cannot be deleted.')

  const { error } = await (supabase as any).from('hq_db_properties').delete().eq('id', propertyId)
  if (error) throw error
  await touchDatabase(supabase, databaseId)
  return detailOrThrow(databaseId)
}

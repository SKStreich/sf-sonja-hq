/**
 * Area junction helpers (Sprint 13 A2) — the knowledge_entry_areas read/write
 * layer, mirroring src/lib/entities/multi-entity.ts. Unlike entities, an area is
 * OPTIONAL: an entry may have zero areas, so there's no "≥1" guard — an empty
 * set just clears the entry's area links.
 *
 * RLS on the junction rides the parent entry (kea_read/insert/delete), so a
 * batch read only ever returns rows for entries the caller can see.
 */

// ── generic junction core (Sprint 13 A3) ────────────────────────────────────
// project_areas and task_areas share knowledge_entry_areas' shape
// (parent_id, area_id, org_id), so the read/write logic is parameterized by the
// table name + parent-id column and specialized below.

async function fetchAreaMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, table: string, parentCol: string, parentIds: string[],
): Promise<Record<string, string[]>> {
  if (parentIds.length === 0) return {}
  const { data } = await supabase.from(table).select(`${parentCol}, area_id`).in(parentCol, parentIds)
  const map: Record<string, string[]> = {}
  for (const row of (data ?? []) as Record<string, string>[]) {
    ;(map[row[parentCol]] ??= []).push(row.area_id)
  }
  return map
}

async function fetchParentIdsForArea(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, table: string, parentCol: string, areaId: string,
): Promise<string[]> {
  const { data } = await supabase.from(table).select(parentCol).eq('area_id', areaId)
  return Array.from(new Set((data ?? []).map((r: Record<string, string>) => r[parentCol]))) as string[]
}

async function fetchParentIdsWithAnyArea(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, table: string, parentCol: string,
): Promise<string[]> {
  const { data } = await supabase.from(table).select(parentCol)
  return Array.from(new Set((data ?? []).map((r: Record<string, string>) => r[parentCol]))) as string[]
}

async function setAreas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any, table: string, parentCol: string, parentId: string, orgId: string, areaIds: string[],
): Promise<void> {
  const desired = Array.from(new Set(areaIds.filter(Boolean)))
  if (desired.length === 0) {
    const { error } = await supabase.from(table).delete().eq(parentCol, parentId)
    if (error) throw new Error(`Failed to clear ${table}: ` + error.message)
    return
  }
  const { error: upErr } = await supabase.from(table).upsert(
    desired.map(area_id => ({ [parentCol]: parentId, area_id, org_id: orgId })),
    { onConflict: `${parentCol},area_id`, ignoreDuplicates: true },
  )
  if (upErr) throw new Error(`Failed to set ${table}: ` + upErr.message)
  const { error: delErr } = await supabase.from(table).delete()
    .eq(parentCol, parentId).not('area_id', 'in', `(${desired.join(',')})`)
  if (delErr) throw new Error(`Failed to prune ${table}: ` + delErr.message)
}

// project_areas helpers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchProjectAreaMap = (supabase: any, ids: string[]) => fetchAreaMap(supabase, 'project_areas', 'project_id', ids)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchProjectIdsForArea = (supabase: any, areaId: string) => fetchParentIdsForArea(supabase, 'project_areas', 'project_id', areaId)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchProjectIdsWithAnyArea = (supabase: any) => fetchParentIdsWithAnyArea(supabase, 'project_areas', 'project_id')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setProjectAreas = (supabase: any, projectId: string, orgId: string, areaIds: string[]) => setAreas(supabase, 'project_areas', 'project_id', projectId, orgId, areaIds)

// task_areas helpers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchTaskAreaMap = (supabase: any, ids: string[]) => fetchAreaMap(supabase, 'task_areas', 'task_id', ids)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const fetchTaskIdsForArea = (supabase: any, areaId: string) => fetchParentIdsForArea(supabase, 'task_areas', 'task_id', areaId)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const setTaskAreas = (supabase: any, taskId: string, orgId: string, areaIds: string[]) => setAreas(supabase, 'task_areas', 'task_id', taskId, orgId, areaIds)

/** Map of entry_id → area_id[] (filing order). */
export async function fetchEntryAreaMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entryIds: string[],
): Promise<Record<string, string[]>> {
  if (entryIds.length === 0) return {}
  const { data } = await supabase
    .from('knowledge_entry_areas')
    .select('entry_id, area_id')
    .in('entry_id', entryIds)
  const map: Record<string, string[]> = {}
  for (const row of (data ?? []) as { entry_id: string; area_id: string }[]) {
    ;(map[row.entry_id] ??= []).push(row.area_id)
  }
  return map
}

/** Entry ids filed under a given area (drives the Entity→Area filter). */
export async function fetchEntryIdsForArea(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  areaId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('knowledge_entry_areas')
    .select('entry_id')
    .eq('area_id', areaId)
  return Array.from(new Set((data ?? []).map((r: { entry_id: string }) => r.entry_id))) as string[]
}

/** All entry ids that have at least one area — used to compute the "No area" set. */
export async function fetchEntryIdsWithAnyArea(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<string[]> {
  const { data } = await supabase
    .from('knowledge_entry_areas')
    .select('entry_id')
  return Array.from(new Set((data ?? []).map((r: { entry_id: string }) => r.entry_id))) as string[]
}

/**
 * Reconcile an entry's area set in knowledge_entry_areas to exactly `areaIds`.
 * Upserts the desired rows + deletes the rest. An empty set clears all areas
 * (areas are optional — no ≥1 guard).
 */
export async function setEntryAreas(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entryId: string,
  orgId: string,
  areaIds: string[],
): Promise<void> {
  const desired = Array.from(new Set(areaIds.filter(Boolean)))
  if (desired.length === 0) {
    const { error } = await supabase
      .from('knowledge_entry_areas').delete().eq('entry_id', entryId)
    if (error) throw new Error('Failed to clear entry areas: ' + error.message)
    return
  }
  const { error: upErr } = await supabase
    .from('knowledge_entry_areas')
    .upsert(
      desired.map(area_id => ({ entry_id: entryId, area_id, org_id: orgId })),
      { onConflict: 'entry_id,area_id', ignoreDuplicates: true },
    )
  if (upErr) throw new Error('Failed to set entry areas: ' + upErr.message)
  const { error: delErr } = await supabase
    .from('knowledge_entry_areas')
    .delete()
    .eq('entry_id', entryId)
    .not('area_id', 'in', `(${desired.join(',')})`)
  if (delErr) throw new Error('Failed to prune entry areas: ' + delErr.message)
}

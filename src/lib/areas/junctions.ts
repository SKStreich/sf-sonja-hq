/**
 * Area junction helpers (Sprint 13 A2) — the knowledge_entry_areas read/write
 * layer, mirroring src/lib/entities/multi-entity.ts. Unlike entities, an area is
 * OPTIONAL: an entry may have zero areas, so there's no "≥1" guard — an empty
 * set just clears the entry's area links.
 *
 * RLS on the junction rides the parent entry (kea_read/insert/delete), so a
 * batch read only ever returns rows for entries the caller can see.
 */

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

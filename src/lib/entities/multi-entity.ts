/**
 * Multi-entity read helpers (Sprint 12 — PR 2a).
 *
 * A knowledge entry / project can belong to MORE THAN ONE entity
 * ("personality"). The membership lives in the junction tables created in
 * `20260531000001_multi_entity_junctions.sql`:
 *   - knowledge_entry_entities (entry_id, entity TEXT)
 *   - project_entities         (project_id, entity_id UUID → entities.id)
 *
 * These helpers batch-read the junctions for a set of parent ids and group the
 * result, so display surfaces can render a chip-SET instead of a single chip.
 *
 * READ-ONLY: writes still flow through the legacy single-entity columns during
 * the PR1→PR2b dual-write window (the add-only mirror triggers keep the
 * junctions populated). PR 2b switches writes to the junction directly.
 */

// Canonical display order for the knowledge entity slugs. Anything not listed
// (shouldn't happen) sorts to the end.
const ENTITY_SLUG_ORDER = ['tm', 'sf', 'sfe', 'sfc', 'personal'] as const

/** De-dupe + sort entity slugs into the canonical display order. */
export function sortEntitySlugs(slugs: string[]): string[] {
  const rank = (s: string) => {
    const i = ENTITY_SLUG_ORDER.indexOf(s as (typeof ENTITY_SLUG_ORDER)[number])
    return i === -1 ? ENTITY_SLUG_ORDER.length : i
  }
  return Array.from(new Set(slugs)).sort((a, b) => rank(a) - rank(b))
}

/**
 * Map of entry_id → sorted entity slugs, read from knowledge_entry_entities.
 * RLS on the junction mirrors the parent entry, so only visible rows return.
 */
export async function fetchEntryEntityMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entryIds: string[],
): Promise<Record<string, string[]>> {
  if (entryIds.length === 0) return {}
  const { data } = await supabase
    .from('knowledge_entry_entities')
    .select('entry_id, entity')
    .in('entry_id', entryIds)
  const map: Record<string, string[]> = {}
  for (const row of (data ?? []) as { entry_id: string; entity: string }[]) {
    ;(map[row.entry_id] ??= []).push(row.entity)
  }
  for (const id of Object.keys(map)) map[id] = sortEntitySlugs(map[id])
  return map
}

/**
 * Entry ids that belong to a given entity slug. Used to drive the knowledge
 * entity filter through the junction (OR-semantics: an entry tagged with the
 * slug matches, regardless of its other entities).
 */
export async function fetchEntryIdsForEntity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entity: string,
): Promise<string[]> {
  const { data } = await supabase
    .from('knowledge_entry_entities')
    .select('entry_id')
    .eq('entity', entity)
  return Array.from(new Set((data ?? []).map((r: { entry_id: string }) => r.entry_id))) as string[]
}

/**
 * Map of project_id → entity_id UUIDs, read from project_entities. The caller
 * resolves each entity_id against the loaded `entities` rows (name/type/color).
 * Ordered by created_at for deterministic chip order before type-sorting.
 */
export async function fetchProjectEntityMap(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectIds: string[],
): Promise<Record<string, string[]>> {
  if (projectIds.length === 0) return {}
  const { data } = await supabase
    .from('project_entities')
    .select('project_id, entity_id, created_at')
    .in('project_id', projectIds)
    .order('created_at', { ascending: true })
  const map: Record<string, string[]> = {}
  for (const row of (data ?? []) as { project_id: string; entity_id: string }[]) {
    ;(map[row.project_id] ??= []).push(row.entity_id)
  }
  return map
}

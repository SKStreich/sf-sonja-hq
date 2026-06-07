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

// ── writes ───────────────────────────────────────────────────────────────────
// PR 2b: writes go to the junction directly (reconcile = upsert desired set +
// delete removed). The caller ALSO keeps the legacy column = primary entity for
// back-compat during the dual-write window. The app-layer "≥1 entity" guard
// (OQ2='app') lives here: an empty set throws.

/**
 * Reconcile a knowledge entry's entity set in knowledge_entry_entities to
 * exactly `entities`. Upserts the desired rows (idempotent vs the mirror
 * trigger) and removes any no-longer-wanted rows. Throws if the set is empty.
 */
export async function setEntryEntities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  entryId: string,
  orgId: string,
  entities: string[],
): Promise<void> {
  const desired = sortEntitySlugs(entities)
  if (desired.length === 0) throw new Error('At least one entity is required')
  const { error: upErr } = await supabase
    .from('knowledge_entry_entities')
    .upsert(
      desired.map(entity => ({ entry_id: entryId, entity, org_id: orgId })),
      { onConflict: 'entry_id,entity', ignoreDuplicates: true },
    )
  if (upErr) throw new Error('Failed to set entry entities: ' + upErr.message)
  const { error: delErr } = await supabase
    .from('knowledge_entry_entities')
    .delete()
    .eq('entry_id', entryId)
    .not('entity', 'in', `(${desired.join(',')})`)
  if (delErr) throw new Error('Failed to prune entry entities: ' + delErr.message)
}

/**
 * Reconcile a project's entity set in project_entities to exactly `entityIds`
 * (UUIDs → entities.id). Same upsert-desired + delete-removed shape. Throws if
 * the set is empty.
 */
export async function setProjectEntities(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  projectId: string,
  orgId: string,
  entityIds: string[],
): Promise<void> {
  const desired = Array.from(new Set(entityIds.filter(Boolean)))
  if (desired.length === 0) throw new Error('At least one entity is required')
  const { error: upErr } = await supabase
    .from('project_entities')
    .upsert(
      desired.map(entity_id => ({ project_id: projectId, entity_id, org_id: orgId })),
      { onConflict: 'project_id,entity_id', ignoreDuplicates: true },
    )
  if (upErr) throw new Error('Failed to set project entities: ' + upErr.message)
  const { error: delErr } = await supabase
    .from('project_entities')
    .delete()
    .eq('project_id', projectId)
    .not('entity_id', 'in', `(${desired.join(',')})`)
  if (delErr) throw new Error('Failed to prune project entities: ' + delErr.message)
}

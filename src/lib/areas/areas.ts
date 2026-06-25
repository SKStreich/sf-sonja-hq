// Sprint 13 · Areas (concept #2 of ae15bcf5) — pure model + helpers.
//
// An area is a per-entity bucket (a middle tier between entity and tags). This
// module is PURE (no I/O) so it's shared by the server actions and the manage UI
// and is unit-tested. Areas are DATA (managed at runtime), not a compile-time
// registry — so unlike entities there's no fixed slug list here.

import type { EntitySlug } from '@/lib/entities/config'

export interface Area {
  id: string
  entity: EntitySlug
  name: string
  slug: string
  sort_order: number
}

/** Turn a display name into a URL/storage-safe slug: lowercase, alphanumerics
 *  kept, every other run collapsed to a single hyphen, edges trimmed. Returns
 *  '' for names with no slug-able characters (caller should reject). */
export function slugifyArea(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Group areas by entity, each list sorted by sort_order then name. */
export function groupAreasByEntity(areas: Area[]): Record<string, Area[]> {
  const out: Record<string, Area[]> = {}
  for (const a of areas) (out[a.entity] ??= []).push(a)
  for (const list of Object.values(out)) list.sort(compareAreas)
  return out
}

/** Stable ordering for an entity's areas: sort_order asc, then name. */
export function compareAreas(a: Area, b: Area): number {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name)
}

/** Next sort_order for a new area within an entity (max + 1, or 0 if none). */
export function nextAreaSortOrder(areasForEntity: Area[]): number {
  return areasForEntity.reduce((max, a) => Math.max(max, a.sort_order + 1), 0)
}

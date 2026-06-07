/**
 * Canonical entity ("personality") registry — the SINGLE source of truth for
 * entity slugs, labels, display order, and colours across HQ.
 *
 * To add / rename an entity:
 *   1. Edit this file (slug, label, colour, class maps).
 *   2. Ship a DB migration that (a) widens the CHECK on knowledge_entries.entity
 *      + knowledge_entry_entities.entity and (b) inserts/renames the row in the
 *      `entities` table (projects/tasks FK to it).
 *
 * Knowledge uses the TEXT slug directly; projects/tasks use the `entities` table
 * (whose `type` column === slug). Keeping both aligned to this list is the point.
 *
 * Tailwind note: the class strings below are literals so the JIT compiler can
 * see them. Do not build entity class names dynamically elsewhere.
 */

export const ENTITY_SLUGS = ['tm', 'cthq', 'sfe', 'sfo', 'sfs', 'sfc', 'personal'] as const
export type EntitySlug = typeof ENTITY_SLUGS[number]

export interface EntityMeta {
  slug: EntitySlug
  /** Full display name. */
  label: string
  /** Short chip/abbrev label. */
  short: string
  /** Hex colour (mirrors entities.color where a project entity exists). */
  color: string
}

export const ENTITY_META: Record<EntitySlug, EntityMeta> = {
  tm:       { slug: 'tm',       label: 'Triplemeter',               short: 'TM',       color: '#3B82F6' },
  cthq:     { slug: 'cthq',     label: 'CTHQ',                      short: 'CTHQ',     color: '#6366F1' },
  sfe:      { slug: 'sfe',      label: 'Streich Force Enterprises', short: 'SFE',      color: '#F59E0B' },
  sfo:      { slug: 'sfo',      label: 'Streich Force Operations',  short: 'SFO',      color: '#F43F5E' },
  sfs:      { slug: 'sfs',      label: 'Streich Force Solutions',   short: 'SFS',      color: '#8B5CF6' },
  sfc:      { slug: 'sfc',      label: 'SF-Containers',             short: 'SFC',      color: '#0891B2' },
  personal: { slug: 'personal', label: 'Personal',                  short: 'Personal', color: '#10B981' },
}

/** Canonical display order (matches ENTITY_SLUGS). */
export const ENTITY_ORDER: readonly string[] = ENTITY_SLUGS

/** De-dupe + sort entity slugs into canonical order (unknown slugs sort last). */
export function sortEntitySlugs(slugs: string[]): string[] {
  const rank = (s: string) => {
    const i = ENTITY_ORDER.indexOf(s)
    return i === -1 ? ENTITY_ORDER.length : i
  }
  return Array.from(new Set(slugs)).sort((a, b) => rank(a) - rank(b))
}

export function entityLabel(slug: string): string {
  return ENTITY_META[slug as EntitySlug]?.label ?? slug
}
export function entityShort(slug: string): string {
  return ENTITY_META[slug as EntitySlug]?.short ?? slug.toUpperCase()
}

/** {value,label} options for select / multi-select pickers, in canonical order. */
export const ENTITY_SELECT_OPTIONS: { value: EntitySlug; label: string }[] =
  ENTITY_SLUGS.map(s => ({ value: s, label: ENTITY_META[s].short }))

// ── Tailwind class maps (literal strings for the JIT) ────────────────────────

/** Soft chip: border + bg-50 + text-700. Keyed by slug. */
export const ENTITY_BADGE_CLASS: Record<EntitySlug, string> = {
  tm:       'bg-blue-50 text-blue-700 border-blue-200',
  cthq:     'bg-indigo-50 text-indigo-700 border-indigo-200',
  sfe:      'bg-amber-50 text-amber-700 border-amber-200',
  sfo:      'bg-rose-50 text-rose-700 border-rose-200',
  sfs:      'bg-violet-50 text-violet-700 border-violet-200',
  sfc:      'bg-cyan-50 text-cyan-700 border-cyan-200',
  personal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
}

/** Toggle chip: solid when on, soft when off. Keyed by slug. */
export const ENTITY_TOGGLE_CLASS: Record<EntitySlug, { on: string; off: string }> = {
  tm:       { on: 'bg-blue-600 text-white border-blue-600',       off: 'bg-blue-50 text-blue-700 border-blue-200' },
  cthq:     { on: 'bg-indigo-600 text-white border-indigo-600',   off: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  sfe:      { on: 'bg-amber-600 text-white border-amber-600',     off: 'bg-amber-50 text-amber-700 border-amber-200' },
  sfo:      { on: 'bg-rose-600 text-white border-rose-600',       off: 'bg-rose-50 text-rose-700 border-rose-200' },
  sfs:      { on: 'bg-violet-600 text-white border-violet-600',   off: 'bg-violet-50 text-violet-700 border-violet-200' },
  sfc:      { on: 'bg-cyan-600 text-white border-cyan-600',       off: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  personal: { on: 'bg-emerald-600 text-white border-emerald-600', off: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}

/** Dashboard card surface (border + bg) and heading text. Keyed by slug. */
export const ENTITY_CARD_CLASS: Record<EntitySlug, string> = {
  tm:       'border-blue-200 bg-blue-50',
  cthq:     'border-indigo-200 bg-indigo-50',
  sfe:      'border-amber-200 bg-amber-50',
  sfo:      'border-rose-200 bg-rose-50',
  sfs:      'border-violet-200 bg-violet-50',
  sfc:      'border-cyan-200 bg-cyan-50',
  personal: 'border-emerald-200 bg-emerald-50',
}
export const ENTITY_CARD_TEXT: Record<EntitySlug, string> = {
  tm:       'text-blue-700',
  cthq:     'text-indigo-700',
  sfe:      'text-amber-700',
  sfo:      'text-rose-700',
  sfs:      'text-violet-700',
  sfc:      'text-cyan-700',
  personal: 'text-emerald-700',
}

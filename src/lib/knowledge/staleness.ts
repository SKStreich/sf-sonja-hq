// Sprint 13 · Staleness model (concept #1 of HQ Knowledge ae15bcf5).
//
// "Stale" is a *computed* condition over two columns on knowledge_entries
// (staleness_days, last_reviewed_at) — there's no stored "stale" status. This
// module is the single source of that formula (PURE, no I/O), so the EntryDetail
// badge, the 🕓 stale hub filter, and the dashboard "to review" count all agree.
//
//   baseline   = last_reviewed_at ?? created_at   (never-reviewed ages from birth)
//   stale when staleness_days > 0 AND now - baseline > staleness_days days
//   staleness_days === 0 means "never goes stale" (foundational primers).

/** The subset of a knowledge entry the staleness formula needs. */
export interface StalenessInput {
  staleness_days: number
  last_reviewed_at: string | null
  created_at: string
}

const DAY_MS = 86_400_000

/** Review-cadence presets surfaced in the EntryDetail selector. 0 = never. */
export const STALENESS_PRESETS: { value: number; label: string }[] = [
  { value: 0, label: 'Never (evergreen)' },
  { value: 30, label: 'Every 30 days' },
  { value: 60, label: 'Every 60 days' },
  { value: 90, label: 'Every 90 days' },
  { value: 180, label: 'Every 180 days' },
]

export const DEFAULT_STALENESS_DAYS = 60

export interface StalenessStatus {
  /** True when the entry is past its review cadence. Always false when evergreen. */
  stale: boolean
  /** staleness_days === 0 — this entry never goes stale. */
  evergreen: boolean
  /** The date the entry ages from: last_reviewed_at, else created_at. */
  baseline: string
  /** Days since the baseline (floored, ≥ 0). */
  ageDays: number
  /** Days until it goes stale (negative = overdue by that many). null when evergreen. */
  dueInDays: number | null
}

/**
 * Compute an entry's staleness status. `now` is injectable so the formula is
 * deterministic in tests and callers can pass a single request-time clock.
 */
export function staleStatus(entry: StalenessInput, now: number = Date.now()): StalenessStatus {
  const evergreen = !entry.staleness_days || entry.staleness_days <= 0
  const baseline = entry.last_reviewed_at ?? entry.created_at
  const baseMs = new Date(baseline).getTime()
  const ageMs = Math.max(0, now - baseMs)
  const ageDays = Math.floor(ageMs / DAY_MS)

  if (evergreen) {
    return { stale: false, evergreen: true, baseline, ageDays, dueInDays: null }
  }
  const dueInDays = entry.staleness_days - ageDays
  return { stale: dueInDays < 0, evergreen: false, baseline, ageDays, dueInDays }
}

/** Convenience predicate — true when the entry is past its review cadence. */
export function isStale(entry: StalenessInput, now: number = Date.now()): boolean {
  return staleStatus(entry, now).stale
}

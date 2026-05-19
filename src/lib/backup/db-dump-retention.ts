/**
 * Retention policy for DB-dump objects in R2.
 *
 * Each daily cron run uploads `db-dumps/daily/{YYYY-MM-DD}.jsonl.gz`, then
 * calls `applyRetention` against the listed keys to decide what to prune.
 *
 * Default policy: 30 daily / 12 weekly / 24 monthly. Newest-first walk —
 * the first 30 distinct days go in the daily slot, then the newest dump in
 * each previously-unseen ISO week fills the weekly slot up to 12, then the
 * newest dump in each previously-unseen calendar month fills the monthly
 * slot up to 24. Everything else gets pruned.
 *
 * Pure function — covered by unit tests. The cron route is the only caller.
 */

export interface RetentionPolicy {
  daily: number
  weekly: number
  monthly: number
}

export type RetentionReason = 'daily' | 'weekly' | 'monthly' | 'prune'

export interface RetentionPlan {
  keep: string[]
  prune: string[]
  reasons: Record<string, RetentionReason>
}

export const DEFAULT_POLICY: RetentionPolicy = {
  daily: 30,
  weekly: 12,
  monthly: 24,
}

const KEY_PATTERN = /^db-dumps\/daily\/(\d{4})-(\d{2})-(\d{2})\.jsonl\.gz$/

export function applyRetention(
  keys: string[],
  policy: RetentionPolicy = DEFAULT_POLICY,
): RetentionPlan {
  const parsed = keys
    .map(parseKey)
    .filter((x): x is ParsedKey => x !== null)
    // Newest first so the daily/weekly/monthly slots fill from the top.
    .sort((a, b) => b.dateStr.localeCompare(a.dateStr))

  const reasons: Record<string, RetentionReason> = {}
  const seenWeeks = new Set<string>()
  const seenMonths = new Set<string>()
  let dailyKept = 0
  let weeklyKept = 0
  let monthlyKept = 0

  for (const entry of parsed) {
    if (dailyKept < policy.daily) {
      reasons[entry.key] = 'daily'
      dailyKept++
      continue
    }
    const weekKey = isoWeekKey(entry.date)
    if (!seenWeeks.has(weekKey) && weeklyKept < policy.weekly) {
      reasons[entry.key] = 'weekly'
      seenWeeks.add(weekKey)
      weeklyKept++
      continue
    }
    // Mark the week as seen even if the slot is full — so later weeks
    // (further from "now") still get a chance to claim the weekly slot
    // exactly once.
    seenWeeks.add(weekKey)

    const monthKey = `${entry.date.getUTCFullYear()}-${pad2(entry.date.getUTCMonth() + 1)}`
    if (!seenMonths.has(monthKey) && monthlyKept < policy.monthly) {
      reasons[entry.key] = 'monthly'
      seenMonths.add(monthKey)
      monthlyKept++
      continue
    }
    seenMonths.add(monthKey)

    reasons[entry.key] = 'prune'
  }

  // Any key that didn't parse stays untouched (treat as keep — we never
  // delete what we don't understand).
  for (const key of keys) {
    if (!(key in reasons) && !KEY_PATTERN.test(key)) {
      reasons[key] = 'daily'
    }
  }

  const keep: string[] = []
  const prune: string[] = []
  for (const key of keys) {
    if (reasons[key] === 'prune') prune.push(key)
    else keep.push(key)
  }
  return { keep, prune, reasons }
}

interface ParsedKey {
  key: string
  dateStr: string
  date: Date
}

function parseKey(key: string): ParsedKey | null {
  const m = KEY_PATTERN.exec(key)
  if (!m) return null
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  if (Number.isNaN(date.getTime())) return null
  return { key, dateStr: `${y}-${mo}-${d}`, date }
}

/**
 * ISO 8601 week-date key — 'YYYY-Www'. Week 1 contains the year's first
 * Thursday. We use ISO week-year so weeks that span year boundaries don't
 * accidentally get double-counted (e.g. 2025-12-29 is `2026-W01`).
 */
function isoWeekKey(d: Date): string {
  // Copy because we mutate.
  const dt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  // ISO weekday: Mon=1..Sun=7. JS getUTCDay: Sun=0..Sat=6.
  const day = dt.getUTCDay() || 7
  // Shift to the Thursday of this ISO week.
  dt.setUTCDate(dt.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1))
  const weekNum = Math.ceil(((dt.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${dt.getUTCFullYear()}-W${pad2(weekNum)}`
}

function pad2(n: number): string {
  return n.toString().padStart(2, '0')
}

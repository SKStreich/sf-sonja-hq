/**
 * Daily Journal — date helpers (Sprint 14 J1).
 * Spec: docs/specs/hq_journal_v1.html, D6: the journal's day boundary is
 * America/Chicago, and this module is the single source of truth for it —
 * the page's "today" AND the auto-context day-range queries (J2) both come
 * from here so a page never disagrees with its rail across midnight.
 *
 * Pure (no Supabase, no React) — unit-tested in src/tests/unit/journal-dates.test.ts.
 */

export const JOURNAL_TIMEZONE = 'America/Chicago'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Strictly validates an ISO YYYY-MM-DD calendar date (rejects 2026-02-30 etc.). */
export function isValidJournalDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

/** Today's journal date (YYYY-MM-DD) in the journal timezone. */
export function todayJournalDate(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JOURNAL_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
}

/** Calendar arithmetic on a YYYY-MM-DD string (timezone-free). */
export function addDays(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10)
}

export const prevJournalDate = (date: string): string => addDays(date, -1)
export const nextJournalDate = (date: string): string => addDays(date, 1)

/** "Monday, July 13, 2026" — display label for a journal date. */
export function formatJournalDateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  }).format(new Date(Date.UTC(y, m - 1, d)))
}

/**
 * The UTC instants bounding a journal day: [start, end) = midnight-to-midnight
 * in the journal timezone. J2's auto-context queries filter timestamps with
 * `>= start AND < end`. DST-safe (a "day" may be 23 or 25 hours long).
 */
export function journalDayBoundsUtc(date: string): { start: string; end: string } {
  return { start: zonedMidnightUtc(date), end: zonedMidnightUtc(addDays(date, 1)) }
}

/** The UTC instant of local midnight (00:00) on `date` in the journal timezone. */
function zonedMidnightUtc(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  // Guess midnight UTC, then correct by the zone offset at the guessed instant.
  // Two passes converge across DST transitions.
  let guess = Date.UTC(y, m - 1, d)
  for (let i = 0; i < 2; i++) {
    guess = Date.UTC(y, m - 1, d) - tzOffsetMinutes(new Date(guess)) * 60_000
  }
  return new Date(guess).toISOString()
}

/** Offset of the journal timezone from UTC at `instant`, in minutes (CDT = -300). */
function tzOffsetMinutes(instant: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: JOURNAL_TIMEZONE, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(instant).map(p => [p.type, p.value])
  )
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    parts.hour === '24' ? 0 : Number(parts.hour), Number(parts.minute), Number(parts.second)
  )
  return (asUtc - instant.getTime()) / 60_000
}

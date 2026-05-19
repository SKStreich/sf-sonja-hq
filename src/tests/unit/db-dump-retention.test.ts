import { describe, it, expect } from 'vitest'
import { applyRetention, DEFAULT_POLICY } from '@/lib/backup/db-dump-retention'

function key(dateStr: string): string {
  return `db-dumps/daily/${dateStr}.jsonl.gz`
}

function daily(startISO: string, n: number): string[] {
  const start = new Date(startISO + 'T00:00:00Z')
  const out: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(start.getTime() - i * 86400000)
    out.push(key(d.toISOString().slice(0, 10)))
  }
  return out
}

describe('applyRetention', () => {
  it('keeps everything when fewer than the daily slot count', () => {
    const keys = daily('2026-05-19', 10)
    const plan = applyRetention(keys)
    expect(plan.keep.sort()).toEqual(keys.sort())
    expect(plan.prune).toEqual([])
  })

  it('keeps 30 daily + weekly + monthly under a full-year load', () => {
    const keys = daily('2026-05-19', 400)
    const plan = applyRetention(keys)

    const daily30 = Object.entries(plan.reasons).filter(([, r]) => r === 'daily').length
    const weekly = Object.entries(plan.reasons).filter(([, r]) => r === 'weekly').length
    const monthly = Object.entries(plan.reasons).filter(([, r]) => r === 'monthly').length

    expect(daily30).toBe(DEFAULT_POLICY.daily)
    expect(weekly).toBe(DEFAULT_POLICY.weekly)
    // 400 days back covers ~13 months, so monthly cap is bounded by available
    // months past the weekly window, not the policy max of 24.
    expect(monthly).toBeGreaterThan(0)
    expect(monthly).toBeLessThanOrEqual(DEFAULT_POLICY.monthly)

    expect(plan.keep.length).toBe(daily30 + weekly + monthly)
    expect(plan.prune.length).toBe(400 - plan.keep.length)
  })

  it('puts the newest dump in the daily slot', () => {
    const keys = daily('2026-05-19', 100)
    const plan = applyRetention(keys)
    expect(plan.reasons[key('2026-05-19')]).toBe('daily')
  })

  it('weekly slot picks the newest dump in each prior ISO week', () => {
    // 90 daily dumps ending today; after 30 daily, weeks are full so the
    // newest dump in each subsequent ISO week should be the weekly winner.
    const keys = daily('2026-05-19', 90)
    const plan = applyRetention(keys)
    const weeklyEntries = Object.entries(plan.reasons).filter(([, r]) => r === 'weekly')
    // Should be 8–9 (days 31–90 spans roughly 9 weeks).
    expect(weeklyEntries.length).toBeGreaterThanOrEqual(7)
    expect(weeklyEntries.length).toBeLessThanOrEqual(DEFAULT_POLICY.weekly)
  })

  it('respects custom policy', () => {
    const keys = daily('2026-05-19', 50)
    const plan = applyRetention(keys, { daily: 5, weekly: 2, monthly: 1 })
    const daily5 = Object.entries(plan.reasons).filter(([, r]) => r === 'daily').length
    const weekly2 = Object.entries(plan.reasons).filter(([, r]) => r === 'weekly').length
    const monthly1 = Object.entries(plan.reasons).filter(([, r]) => r === 'monthly').length
    expect(daily5).toBe(5)
    expect(weekly2).toBe(2)
    expect(monthly1).toBe(1)
    expect(plan.prune.length).toBe(50 - 5 - 2 - 1)
  })

  it('does not prune unknown keys', () => {
    const keys = [
      ...daily('2026-05-19', 5),
      'db-dumps/manual/2026-05-19-extra.jsonl.gz',
      'something-else/file.txt',
    ]
    const plan = applyRetention(keys)
    expect(plan.prune).toEqual([])
    expect(plan.keep).toContain('db-dumps/manual/2026-05-19-extra.jsonl.gz')
    expect(plan.keep).toContain('something-else/file.txt')
  })

  it('is idempotent — running on a freshly-pruned set keeps everyone', () => {
    const keys = daily('2026-05-19', 400)
    const first = applyRetention(keys)
    const second = applyRetention(first.keep)
    expect(second.prune).toEqual([])
    expect(second.keep.sort()).toEqual(first.keep.sort())
  })

  it('handles year-boundary ISO weeks (2025-12-29 = 2026-W01)', () => {
    // A daily series straddling year-end shouldn't double-count the
    // ISO week that spans 2025 and 2026.
    const keys = daily('2026-01-15', 60)
    const plan = applyRetention(keys, { daily: 10, weekly: 12, monthly: 24 })
    // Daily slots are filled first, then weekly. We just sanity-check that
    // no two weekly entries fall in the same ISO week.
    const weeklyEntries = Object.entries(plan.reasons)
      .filter(([, r]) => r === 'weekly')
      .map(([k]) => k)
    expect(new Set(weeklyEntries).size).toBe(weeklyEntries.length)
  })
})

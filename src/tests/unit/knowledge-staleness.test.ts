/** Staleness formula (Sprint 13, concept #1) — pure, clock-injected. */
import { describe, it, expect } from 'vitest'
import { staleStatus, isStale, STALENESS_PRESETS } from '@/lib/knowledge/staleness'

const NOW = new Date('2026-06-25T12:00:00Z').getTime()
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

describe('staleStatus', () => {
  it('ages from last_reviewed_at when present', () => {
    const s = staleStatus({ staleness_days: 60, last_reviewed_at: daysAgo(70), created_at: daysAgo(400) }, NOW)
    expect(s.stale).toBe(true)
    expect(s.ageDays).toBe(70)
    expect(s.dueInDays).toBe(-10)
    expect(s.baseline).toBe(daysAgo(70))
  })

  it('ages from created_at when never reviewed', () => {
    const s = staleStatus({ staleness_days: 30, last_reviewed_at: null, created_at: daysAgo(45) }, NOW)
    expect(s.stale).toBe(true)
    expect(s.ageDays).toBe(45)
    expect(s.dueInDays).toBe(-15)
    expect(s.baseline).toBe(daysAgo(45))
  })

  it('is fresh when within the cadence', () => {
    const s = staleStatus({ staleness_days: 60, last_reviewed_at: daysAgo(10), created_at: daysAgo(200) }, NOW)
    expect(s.stale).toBe(false)
    expect(s.dueInDays).toBe(50)
  })

  it('treats the exact boundary as still fresh (overdue only when strictly past)', () => {
    const s = staleStatus({ staleness_days: 60, last_reviewed_at: daysAgo(60), created_at: daysAgo(200) }, NOW)
    expect(s.stale).toBe(false)
    expect(s.dueInDays).toBe(0)
  })

  it('never goes stale when staleness_days is 0 (evergreen)', () => {
    const s = staleStatus({ staleness_days: 0, last_reviewed_at: null, created_at: daysAgo(9999) }, NOW)
    expect(s.evergreen).toBe(true)
    expect(s.stale).toBe(false)
    expect(s.dueInDays).toBeNull()
  })

  it('clamps a future baseline to zero age (no negative age)', () => {
    const s = staleStatus({ staleness_days: 30, last_reviewed_at: daysAgo(-5), created_at: daysAgo(-5) }, NOW)
    expect(s.ageDays).toBe(0)
    expect(s.stale).toBe(false)
  })
})

describe('isStale', () => {
  it('mirrors staleStatus().stale', () => {
    expect(isStale({ staleness_days: 60, last_reviewed_at: daysAgo(90), created_at: daysAgo(90) }, NOW)).toBe(true)
    expect(isStale({ staleness_days: 60, last_reviewed_at: daysAgo(5), created_at: daysAgo(5) }, NOW)).toBe(false)
    expect(isStale({ staleness_days: 0, last_reviewed_at: null, created_at: daysAgo(9999) }, NOW)).toBe(false)
  })
})

describe('STALENESS_PRESETS', () => {
  it('includes the evergreen (0) and default (60) options', () => {
    expect(STALENESS_PRESETS.find(p => p.value === 0)).toBeTruthy()
    expect(STALENESS_PRESETS.find(p => p.value === 60)).toBeTruthy()
  })
})

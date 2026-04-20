import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Pure helpers extracted from DashboardHome — tested here before any component renders

function greeting(name: string, hour: number): string {
  const part = hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
  return `Good ${part}, ${name}`
}

function isOverdue(date: string | null, today: string): boolean {
  if (!date) return false
  return date < today
}

function relativeTime(iso: string, now: number): string {
  const diffMs = now - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay === 1) return 'Yesterday'
  return `${diffDay}d ago`
}

describe('greeting()', () => {
  it('says morning before noon', () => {
    expect(greeting('Sonja', 8)).toBe('Good morning, Sonja')
  })
  it('says afternoon from noon to 5pm', () => {
    expect(greeting('Sonja', 14)).toBe('Good afternoon, Sonja')
  })
  it('says evening from 5pm onward', () => {
    expect(greeting('Sonja', 18)).toBe('Good evening, Sonja')
  })
  it('boundary: noon is afternoon', () => {
    expect(greeting('Sonja', 12)).toBe('Good afternoon, Sonja')
  })
  it('boundary: 17:00 is evening', () => {
    expect(greeting('Sonja', 17)).toBe('Good evening, Sonja')
  })
})

describe('isOverdue()', () => {
  const today = '2026-04-18'

  it('returns true for a date in the past', () => {
    expect(isOverdue('2026-04-17', today)).toBe(true)
  })
  it('returns false for today', () => {
    expect(isOverdue('2026-04-18', today)).toBe(false)
  })
  it('returns false for a future date', () => {
    expect(isOverdue('2026-04-19', today)).toBe(false)
  })
  it('returns false for null', () => {
    expect(isOverdue(null, today)).toBe(false)
  })
})

describe('relativeTime()', () => {
  const base = new Date('2026-04-18T12:00:00Z').getTime()

  it('returns "Just now" for under 1 minute', () => {
    expect(relativeTime(new Date(base - 30_000).toISOString(), base)).toBe('Just now')
  })
  it('returns minutes for under 1 hour', () => {
    expect(relativeTime(new Date(base - 45 * 60_000).toISOString(), base)).toBe('45m ago')
  })
  it('returns hours for under 24 hours', () => {
    expect(relativeTime(new Date(base - 3 * 3_600_000).toISOString(), base)).toBe('3h ago')
  })
  it('returns "Yesterday" for exactly 1 day', () => {
    expect(relativeTime(new Date(base - 86_400_000).toISOString(), base)).toBe('Yesterday')
  })
  it('returns days for older entries', () => {
    expect(relativeTime(new Date(base - 3 * 86_400_000).toISOString(), base)).toBe('3d ago')
  })
})

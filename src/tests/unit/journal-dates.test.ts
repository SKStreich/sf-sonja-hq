import { describe, expect, it } from 'vitest'
import {
  JOURNAL_TIMEZONE,
  addDays,
  formatJournalDateLabel,
  isValidJournalDate,
  journalDayBoundsUtc,
  nextJournalDate,
  prevJournalDate,
  todayJournalDate,
} from '@/lib/journal/dates'

describe('journal dates', () => {
  it('pins the journal timezone to America/Chicago (D6)', () => {
    expect(JOURNAL_TIMEZONE).toBe('America/Chicago')
  })

  describe('isValidJournalDate', () => {
    it('accepts real ISO dates', () => {
      expect(isValidJournalDate('2026-07-14')).toBe(true)
      expect(isValidJournalDate('2024-02-29')).toBe(true) // leap day
    })
    it('rejects malformed strings', () => {
      expect(isValidJournalDate('2026-7-14')).toBe(false)
      expect(isValidJournalDate('20260714')).toBe(false)
      expect(isValidJournalDate('not-a-date')).toBe(false)
      expect(isValidJournalDate('')).toBe(false)
    })
    it('rejects impossible calendar dates', () => {
      expect(isValidJournalDate('2026-02-30')).toBe(false)
      expect(isValidJournalDate('2026-13-01')).toBe(false)
      expect(isValidJournalDate('2025-02-29')).toBe(false) // not a leap year
    })
  })

  describe('todayJournalDate', () => {
    // Chicago is UTC-5 (CDT) in July: the local day flips at 05:00Z.
    it('is still "yesterday" just before the Chicago midnight', () => {
      expect(todayJournalDate(new Date('2026-07-14T04:59:00Z'))).toBe('2026-07-13')
    })
    it('flips at Chicago midnight, not UTC midnight', () => {
      expect(todayJournalDate(new Date('2026-07-14T05:00:00Z'))).toBe('2026-07-14')
    })
    it('handles winter (CST, UTC-6)', () => {
      expect(todayJournalDate(new Date('2026-01-10T05:59:00Z'))).toBe('2026-01-09')
      expect(todayJournalDate(new Date('2026-01-10T06:00:00Z'))).toBe('2026-01-10')
    })
  })

  describe('addDays / prev / next', () => {
    it('crosses month and year boundaries', () => {
      expect(nextJournalDate('2026-07-31')).toBe('2026-08-01')
      expect(prevJournalDate('2026-08-01')).toBe('2026-07-31')
      expect(nextJournalDate('2026-12-31')).toBe('2027-01-01')
      expect(addDays('2026-07-14', -14)).toBe('2026-06-30')
    })
    it('handles leap february', () => {
      expect(nextJournalDate('2024-02-28')).toBe('2024-02-29')
      expect(nextJournalDate('2024-02-29')).toBe('2024-03-01')
    })
  })

  describe('journalDayBoundsUtc', () => {
    it('bounds a summer day (CDT, UTC-5)', () => {
      expect(journalDayBoundsUtc('2026-07-13')).toEqual({
        start: '2026-07-13T05:00:00.000Z',
        end: '2026-07-14T05:00:00.000Z',
      })
    })
    it('bounds a winter day (CST, UTC-6)', () => {
      expect(journalDayBoundsUtc('2026-01-10')).toEqual({
        start: '2026-01-10T06:00:00.000Z',
        end: '2026-01-11T06:00:00.000Z',
      })
    })
    it('spring-forward day is 23 hours (2026-03-08)', () => {
      const { start, end } = journalDayBoundsUtc('2026-03-08')
      expect(start).toBe('2026-03-08T06:00:00.000Z') // midnight CST
      expect(end).toBe('2026-03-09T05:00:00.000Z')   // next midnight CDT
    })
    it('fall-back day is 25 hours (2026-11-01)', () => {
      const { start, end } = journalDayBoundsUtc('2026-11-01')
      expect(start).toBe('2026-11-01T05:00:00.000Z') // midnight CDT
      expect(end).toBe('2026-11-02T06:00:00.000Z')   // next midnight CST
    })
  })

  describe('formatJournalDateLabel', () => {
    it('renders a full human label', () => {
      expect(formatJournalDateLabel('2026-07-14')).toMatch(/^[A-Z][a-z]+, July 14, 2026$/)
    })
  })
})

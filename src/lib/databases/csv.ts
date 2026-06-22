// HQ Databases — CSV export (Phase U2). Pure, unit-testable.
// Turns a DatabaseDetail into a spreadsheet-friendly CSV string (RFC-4180-ish:
// CRLF rows, quote fields containing comma/quote/newline, double inner quotes).

import type { DatabaseDetail, DbProperty } from './types'
import { orderedProperties } from './format'

function cellText(_p: DbProperty, value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  if (Array.isArray(value)) return value.map((v) => String(v)).join('; ')
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  return String(value)
}

function escapeCsv(s: string): string {
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function databaseToCsv(detail: DatabaseDetail): string {
  const cols = orderedProperties(detail.properties)
  const header = cols.map((c) => escapeCsv(c.name)).join(',')
  const rows = detail.records.map((rec) =>
    cols.map((c) => escapeCsv(cellText(c, rec.values[c.id]))).join(','),
  )
  return [header, ...rows].join('\r\n')
}

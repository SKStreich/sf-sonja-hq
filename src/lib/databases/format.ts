// HQ Databases — pure presentation helpers (Phase B1).
// No React, no I/O — fully unit-testable. The table view turns each
// (property, raw value) pair into a CellModel and renders dumbly from it.

import type { DbProperty, DbRecord } from './types'

// Notion-style color name → Tailwind pill classes. Unknown / missing → gray.
const COLOR_CLASS: Record<string, string> = {
  default: 'bg-gray-100 text-gray-700',
  gray: 'bg-gray-100 text-gray-700',
  brown: 'bg-amber-100 text-amber-800',
  orange: 'bg-orange-100 text-orange-700',
  yellow: 'bg-yellow-100 text-yellow-800',
  green: 'bg-green-100 text-green-700',
  blue: 'bg-blue-100 text-blue-700',
  purple: 'bg-purple-100 text-purple-700',
  pink: 'bg-pink-100 text-pink-700',
  red: 'bg-red-100 text-red-700',
}

export function optionColorClass(color?: string): string {
  if (!color) return COLOR_CLASS.default
  return COLOR_CLASS[color] ?? COLOR_CLASS.default
}

export interface Chip {
  label: string
  className: string
}

export type CellModel =
  | { kind: 'empty' }
  | { kind: 'text'; text: string }
  | { kind: 'checkbox'; checked: boolean }
  | { kind: 'url'; href: string; text: string }
  | { kind: 'chips'; chips: Chip[] }

function isEmpty(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

// Format an ISO date / date string for display. Returns the raw string if it
// can't be parsed, so nothing is ever silently dropped.
export function formatDateValue(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return String(value ?? '')
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  // A date-only string ("2026-01-15") is a calendar date, not an instant —
  // parse it as UTC midnight and format in UTC so it never shifts a day under
  // the viewer's local timezone. Full datetimes keep local formatting.
  const dateOnly = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(dateOnly ? { timeZone: 'UTC' } : {}),
  })
}

function chipClassFor(name: string, options?: { name: string; color?: string }[]): string {
  const opt = options?.find((o) => o.name === name)
  return optionColorClass(opt?.color)
}

// The core render model. `value` is the raw JSONB value stored for this
// property on a record.
export function cellModel(property: DbProperty, value: unknown): CellModel {
  if (isEmpty(value) && property.type !== 'checkbox') return { kind: 'empty' }

  switch (property.type) {
    case 'checkbox':
      return { kind: 'checkbox', checked: value === true }

    case 'number':
      return { kind: 'text', text: typeof value === 'number' ? String(value) : String(value) }

    case 'date':
      return { kind: 'text', text: formatDateValue(value) }

    case 'url': {
      const href = String(value)
      return { kind: 'url', href, text: href }
    }

    case 'select':
    case 'status': {
      const label = String(value)
      return { kind: 'chips', chips: [{ label, className: chipClassFor(label, property.config.options) }] }
    }

    case 'multi_select': {
      const arr = Array.isArray(value) ? value : [value]
      return {
        kind: 'chips',
        chips: arr.map((v) => {
          const label = String(v)
          return { label, className: chipClassFor(label, property.config.options) }
        }),
      }
    }

    case 'relation': {
      // v1 stores related row ids / labels; resolution to titles is B2.
      const arr = Array.isArray(value) ? value : [value]
      return { kind: 'text', text: arr.map((v) => String(v)).join(', ') }
    }

    case 'text':
    default:
      return { kind: 'text', text: String(value) }
  }
}

// Column order for the table view: the title property first, then the rest by
// `position` (stable, ascending), id as a final tiebreaker.
export function orderedProperties(properties: DbProperty[]): DbProperty[] {
  return [...properties].sort((a, b) => {
    if (a.is_title !== b.is_title) return a.is_title ? -1 : 1
    if (a.position !== b.position) return a.position - b.position
    return a.id.localeCompare(b.id)
  })
}

export function titleProperty(properties: DbProperty[]): DbProperty | undefined {
  return properties.find((p) => p.is_title)
}

// The display label for a record (its title-property value), with a fallback so
// a row is never blank in a title column.
export function recordTitle(properties: DbProperty[], record: DbRecord): string {
  const title = titleProperty(properties)
  if (!title) return 'Untitled'
  const raw = record.values[title.id]
  if (isEmpty(raw)) return 'Untitled'
  return String(raw)
}

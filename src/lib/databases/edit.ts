// HQ Databases — pure editing helpers (Phase U3a).
// No React, no I/O — fully unit-testable. Turns raw form input into the typed
// JSONB value stored on a record, and validates column (property) edits. The
// table editor renders dumb inputs and routes everything through here so the
// type rules live in one place (mirror of format.ts on the read side).

import type { DbPropertyType, DbSelectOption } from './types'

export const PROPERTY_TYPES: { value: DbPropertyType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'status', label: 'Status' },
  { value: 'checkbox', label: 'Checkbox' },
  { value: 'date', label: 'Date' },
  { value: 'url', label: 'URL' },
  { value: 'relation', label: 'Relation' },
]

const VALID_TYPES = new Set<string>(PROPERTY_TYPES.map((t) => t.value))

/** Types whose `config.options` list drives chip rendering / editing. */
export function typeUsesOptions(type: DbPropertyType): boolean {
  return type === 'select' || type === 'multi_select' || type === 'status'
}

export function isValidPropertyType(type: string): type is DbPropertyType {
  return VALID_TYPES.has(type)
}

/** Turn a raw editor value into the JSONB value to persist for one cell.
 *  `raw` is a string for most types, a boolean for checkbox, or a string[] for
 *  multi_select / relation. Empty input clears the cell (null / []). */
export function parseCellInput(type: DbPropertyType, raw: unknown): unknown {
  switch (type) {
    case 'checkbox':
      return raw === true || raw === 'true'

    case 'number': {
      if (raw === '' || raw === null || raw === undefined) return null
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
      return Number.isFinite(n) ? n : null
    }

    case 'multi_select':
    case 'relation': {
      const arr = Array.isArray(raw)
        ? raw
        : String(raw ?? '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
      return arr.map((v) => String(v).trim()).filter(Boolean)
    }

    case 'text':
    case 'select':
    case 'status':
    case 'date':
    case 'url':
    default: {
      const s = String(raw ?? '').trim()
      return s === '' ? null : s
    }
  }
}

/** Turn a stored cell value back into the string an <input>/<textarea> shows
 *  while editing (inverse of parseCellInput for the single-value types). */
export function cellInputValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (Array.isArray(value)) return value.map((v) => String(v)).join(', ')
  return String(value)
}

/** Parse a comma / newline-separated option list into DbSelectOption[],
 *  de-duplicated, order-preserving. Used by the column type/option picker. */
export function parseOptionsInput(text: string): DbSelectOption[] {
  const seen = new Set<string>()
  const out: DbSelectOption[] = []
  for (const part of String(text ?? '').split(/[,\n]/)) {
    const name = part.trim()
    if (!name || seen.has(name)) continue
    seen.add(name)
    out.push({ name })
  }
  return out
}

/** The position a newly-appended row/column should take: max(existing) + 1. */
export function nextPosition(items: { position: number }[]): number {
  return items.reduce((max, i) => Math.max(max, i.position), -1) + 1
}

/** Validate + normalize a column definition before it hits the DB. Throws a
 *  user-facing Error on bad input. `config.options` is only kept for the
 *  option-bearing types. */
export function normalizePropertyInput(input: {
  name: string
  type: string
  options?: DbSelectOption[]
}): { name: string; type: DbPropertyType; config: { options?: DbSelectOption[] } } {
  const name = input.name.trim()
  if (!name) throw new Error('Column name is required.')
  if (!isValidPropertyType(input.type)) throw new Error(`Unknown column type: ${input.type}`)
  const type = input.type
  const config: { options?: DbSelectOption[] } = {}
  if (typeUsesOptions(type) && input.options && input.options.length > 0) {
    config.options = input.options
  }
  return { name, type, config }
}

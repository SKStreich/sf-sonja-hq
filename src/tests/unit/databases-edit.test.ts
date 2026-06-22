import { describe, it, expect } from 'vitest'
import {
  parseCellInput,
  cellInputValue,
  parseOptionsInput,
  nextPosition,
  normalizePropertyInput,
  typeUsesOptions,
  isValidPropertyType,
} from '@/lib/databases/edit'

describe('parseCellInput', () => {
  it('checkbox coerces truthy/falsey', () => {
    expect(parseCellInput('checkbox', true)).toBe(true)
    expect(parseCellInput('checkbox', 'true')).toBe(true)
    expect(parseCellInput('checkbox', false)).toBe(false)
    expect(parseCellInput('checkbox', '')).toBe(false)
  })

  it('number parses valid, nulls empty/invalid', () => {
    expect(parseCellInput('number', '42')).toBe(42)
    expect(parseCellInput('number', '3.5')).toBe(3.5)
    expect(parseCellInput('number', 7)).toBe(7)
    expect(parseCellInput('number', '')).toBeNull()
    expect(parseCellInput('number', 'abc')).toBeNull()
  })

  it('text/select/status/url/date trims, empty → null', () => {
    expect(parseCellInput('text', '  hi  ')).toBe('hi')
    expect(parseCellInput('select', 'Done')).toBe('Done')
    expect(parseCellInput('status', '')).toBeNull()
    expect(parseCellInput('url', ' https://x.dev ')).toBe('https://x.dev')
    expect(parseCellInput('date', '2026-01-15')).toBe('2026-01-15')
    expect(parseCellInput('date', '   ')).toBeNull()
  })

  it('multi_select / relation split commas, drop blanks', () => {
    expect(parseCellInput('multi_select', 'a, b ,,c')).toEqual(['a', 'b', 'c'])
    expect(parseCellInput('multi_select', '')).toEqual([])
    expect(parseCellInput('relation', ['id1', ' id2 '])).toEqual(['id1', 'id2'])
    expect(parseCellInput('multi_select', ['x', '', 'y'])).toEqual(['x', 'y'])
  })
})

describe('cellInputValue', () => {
  it('renders stored value back to an input string', () => {
    expect(cellInputValue(null)).toBe('')
    expect(cellInputValue(undefined)).toBe('')
    expect(cellInputValue(42)).toBe('42')
    expect(cellInputValue('hi')).toBe('hi')
    expect(cellInputValue(['a', 'b'])).toBe('a, b')
  })
})

describe('parseOptionsInput', () => {
  it('splits on comma/newline, dedupes, preserves order', () => {
    expect(parseOptionsInput('Red, Green\nBlue, Red')).toEqual([
      { name: 'Red' },
      { name: 'Green' },
      { name: 'Blue' },
    ])
    expect(parseOptionsInput('   ')).toEqual([])
  })
})

describe('nextPosition', () => {
  it('is max+1, or 0 for empty', () => {
    expect(nextPosition([])).toBe(0)
    expect(nextPosition([{ position: 0 }, { position: 4 }, { position: 2 }])).toBe(5)
  })
})

describe('typeUsesOptions / isValidPropertyType', () => {
  it('option-bearing types', () => {
    expect(typeUsesOptions('select')).toBe(true)
    expect(typeUsesOptions('multi_select')).toBe(true)
    expect(typeUsesOptions('status')).toBe(true)
    expect(typeUsesOptions('text')).toBe(false)
    expect(typeUsesOptions('number')).toBe(false)
  })
  it('validates type strings', () => {
    expect(isValidPropertyType('text')).toBe(true)
    expect(isValidPropertyType('relation')).toBe(true)
    expect(isValidPropertyType('bogus')).toBe(false)
  })
})

describe('normalizePropertyInput', () => {
  it('trims name, keeps options only for option types', () => {
    expect(
      normalizePropertyInput({ name: '  Status ', type: 'status', options: [{ name: 'Open' }] }),
    ).toEqual({ name: 'Status', type: 'status', config: { options: [{ name: 'Open' }] } })

    expect(normalizePropertyInput({ name: 'Notes', type: 'text', options: [{ name: 'x' }] })).toEqual({
      name: 'Notes',
      type: 'text',
      config: {},
    })
  })

  it('drops empty option list to a bare config', () => {
    expect(normalizePropertyInput({ name: 'Tags', type: 'multi_select', options: [] })).toEqual({
      name: 'Tags',
      type: 'multi_select',
      config: {},
    })
  })

  it('throws on blank name or unknown type', () => {
    expect(() => normalizePropertyInput({ name: '  ', type: 'text' })).toThrow(/name is required/)
    expect(() => normalizePropertyInput({ name: 'X', type: 'bogus' })).toThrow(/Unknown column type/)
  })
})

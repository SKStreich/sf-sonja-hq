import { describe, it, expect } from 'vitest'
import {
  cellModel,
  optionColorClass,
  formatDateValue,
  orderedProperties,
  titleProperty,
  recordTitle,
  buildRelationMap,
} from '@/lib/databases/format'
import type { DbProperty, DbRecord } from '@/lib/databases/types'

function prop(partial: Partial<DbProperty> & Pick<DbProperty, 'type'>): DbProperty {
  return {
    id: partial.id ?? 'p1',
    database_id: 'db1',
    name: partial.name ?? 'Col',
    type: partial.type,
    position: partial.position ?? 0,
    config: partial.config ?? {},
    is_title: partial.is_title ?? false,
  }
}

describe('optionColorClass', () => {
  it('maps known Notion colors', () => {
    expect(optionColorClass('green')).toContain('green')
    expect(optionColorClass('blue')).toContain('blue')
  })
  it('falls back to gray for unknown / missing', () => {
    expect(optionColorClass(undefined)).toContain('gray')
    expect(optionColorClass('chartreuse')).toContain('gray')
  })
})

describe('formatDateValue', () => {
  it('formats an ISO date', () => {
    expect(formatDateValue('2026-06-21')).toBe('Jun 21, 2026')
  })
  it('returns the raw string when unparseable', () => {
    expect(formatDateValue('not-a-date')).toBe('not-a-date')
  })
})

describe('cellModel', () => {
  it('empty values render as empty (except checkbox)', () => {
    expect(cellModel(prop({ type: 'text' }), null)).toEqual({ kind: 'empty' })
    expect(cellModel(prop({ type: 'text' }), '')).toEqual({ kind: 'empty' })
    expect(cellModel(prop({ type: 'multi_select' }), [])).toEqual({ kind: 'empty' })
  })

  it('checkbox is never empty', () => {
    expect(cellModel(prop({ type: 'checkbox' }), null)).toEqual({ kind: 'checkbox', checked: false })
    expect(cellModel(prop({ type: 'checkbox' }), true)).toEqual({ kind: 'checkbox', checked: true })
  })

  it('text and number render as text', () => {
    expect(cellModel(prop({ type: 'text' }), 'hello')).toEqual({ kind: 'text', text: 'hello' })
    expect(cellModel(prop({ type: 'number' }), 42)).toEqual({ kind: 'text', text: '42' })
  })

  it('date renders formatted', () => {
    expect(cellModel(prop({ type: 'date' }), '2026-01-15')).toEqual({ kind: 'text', text: 'Jan 15, 2026' })
  })

  it('url renders a link', () => {
    expect(cellModel(prop({ type: 'url' }), 'https://x.test')).toEqual({
      kind: 'url',
      href: 'https://x.test',
      text: 'https://x.test',
    })
  })

  it('select carries the option color', () => {
    const p = prop({ type: 'select', config: { options: [{ name: 'Done', color: 'green' }] } })
    const m = cellModel(p, 'Done')
    expect(m.kind).toBe('chips')
    if (m.kind === 'chips') {
      expect(m.chips).toHaveLength(1)
      expect(m.chips[0].label).toBe('Done')
      expect(m.chips[0].className).toContain('green')
    }
  })

  it('multi_select renders one chip per value, unknown options gray', () => {
    const p = prop({ type: 'multi_select', config: { options: [{ name: 'A', color: 'blue' }] } })
    const m = cellModel(p, ['A', 'B'])
    expect(m.kind).toBe('chips')
    if (m.kind === 'chips') {
      expect(m.chips.map((c) => c.label)).toEqual(['A', 'B'])
      expect(m.chips[0].className).toContain('blue')
      expect(m.chips[1].className).toContain('gray')
    }
  })

  it('relation without a resolver shows raw ids, unresolved', () => {
    expect(cellModel(prop({ type: 'relation' }), ['r1', 'r2'])).toEqual({
      kind: 'relation',
      items: [
        { label: 'r1', resolved: false },
        { label: 'r2', resolved: false },
      ],
    })
  })

  it('relation with a resolver renders target titles, falling back to raw id', () => {
    const resolve = (id: string) =>
      id === 'page-1' ? { recordId: 'rec-1', title: 'In Transit Modal' } : null
    expect(cellModel(prop({ type: 'relation' }), ['page-1', 'page-x'], resolve)).toEqual({
      kind: 'relation',
      items: [
        { label: 'In Transit Modal', recordId: 'rec-1', resolved: true },
        { label: 'page-x', resolved: false },
      ],
    })
  })

  it('relation coerces a non-array value into a single item', () => {
    const m = cellModel(prop({ type: 'relation' }), 'page-1')
    expect(m).toEqual({ kind: 'relation', items: [{ label: 'page-1', resolved: false }] })
  })
})

describe('buildRelationMap', () => {
  const props = [
    prop({ id: 't', type: 'text', is_title: true, name: 'Section Name' }),
    prop({ id: 'x', type: 'text' }),
  ]
  const rec = (id: string, title: string, notion_page_id?: string | null): DbRecord => ({
    id, database_id: 'db1', position: 0, values: { t: title }, notion_page_id,
    created_at: '', updated_at: '',
  })

  it('keys a record by both its HQ id and its Notion page id', () => {
    const map = buildRelationMap(props, [rec('rec-1', 'In Transit Modal', 'page-1')])
    expect(map['rec-1']).toEqual({ recordId: 'rec-1', title: 'In Transit Modal' })
    expect(map['page-1']).toEqual({ recordId: 'rec-1', title: 'In Transit Modal' })
  })

  it('omits the page-id key when a record has no notion_page_id', () => {
    const map = buildRelationMap(props, [rec('rec-2', 'Sourced Equipment Modal', null)])
    expect(Object.keys(map)).toEqual(['rec-2'])
  })
})

describe('orderedProperties', () => {
  it('puts the title first, then sorts by position', () => {
    const props = [
      prop({ id: 'b', type: 'text', position: 2 }),
      prop({ id: 'a', type: 'text', position: 1 }),
      prop({ id: 't', type: 'text', position: 5, is_title: true }),
    ]
    expect(orderedProperties(props).map((p) => p.id)).toEqual(['t', 'a', 'b'])
  })
})

describe('titleProperty / recordTitle', () => {
  const props = [
    prop({ id: 't', type: 'text', is_title: true, name: 'Name' }),
    prop({ id: 'x', type: 'text' }),
  ]
  const rec = (values: Record<string, unknown>): DbRecord => ({
    id: 'r', database_id: 'db1', position: 0, values, created_at: '', updated_at: '',
  })

  it('finds the title property', () => {
    expect(titleProperty(props)?.id).toBe('t')
  })
  it('returns the title value', () => {
    expect(recordTitle(props, rec({ t: 'Hello' }))).toBe('Hello')
  })
  it('falls back to Untitled when the title value is empty', () => {
    expect(recordTitle(props, rec({ t: '' }))).toBe('Untitled')
  })
  it('falls back to Untitled when there is no title property', () => {
    expect(recordTitle([prop({ type: 'text' })], rec({}))).toBe('Untitled')
  })
})

import { describe, it, expect } from 'vitest'
import { databaseToCsv } from '@/lib/databases/csv'
import { safeDownloadName } from '@/lib/knowledge/download'
import type { DatabaseDetail, DbProperty, DbRecord } from '@/lib/databases/types'

function prop(p: Partial<DbProperty> & Pick<DbProperty, 'id' | 'type'>): DbProperty {
  return { database_id: 'db1', name: p.id, position: 0, config: {}, is_title: false, ...p }
}
function rec(id: string, values: Record<string, unknown>): DbRecord {
  return { id, database_id: 'db1', position: 0, values, created_at: '', updated_at: '' }
}
function detail(properties: DbProperty[], records: DbRecord[]): DatabaseDetail {
  return {
    database: { id: 'db1', org_id: 'o', title: 'T', icon: null, description: null, created_by: null, created_at: '', updated_at: '', entities: [] },
    properties, records,
  }
}

describe('databaseToCsv', () => {
  it('emits a header row from ordered properties (title first)', () => {
    const props = [
      prop({ id: 'a', name: 'Count', type: 'number', position: 1 }),
      prop({ id: 't', name: 'Name', type: 'text', position: 0, is_title: true }),
    ]
    const csv = databaseToCsv(detail(props, []))
    expect(csv).toBe('Name,Count')
  })

  it('renders rows with arrays joined and booleans as Yes/No', () => {
    const props = [
      prop({ id: 't', name: 'Name', type: 'text', is_title: true, position: 0 }),
      prop({ id: 'tags', name: 'Tags', type: 'multi_select', position: 1 }),
      prop({ id: 'done', name: 'Done', type: 'checkbox', position: 2 }),
    ]
    const csv = databaseToCsv(detail(props, [
      rec('r1', { t: 'Row 1', tags: ['a', 'b'], done: true }),
      rec('r2', { t: 'Row 2', done: false }),
    ]))
    const lines = csv.split('\r\n')
    expect(lines[0]).toBe('Name,Tags,Done')
    expect(lines[1]).toBe('Row 1,a; b,Yes')
    expect(lines[2]).toBe('Row 2,,No')
  })

  it('quotes fields containing commas, quotes, and newlines', () => {
    const props = [prop({ id: 't', name: 'Name', type: 'text', is_title: true })]
    const csv = databaseToCsv(detail(props, [
      rec('r1', { t: 'a, b' }),
      rec('r2', { t: 'he said "hi"' }),
      rec('r3', { t: 'line1\nline2' }),
    ]))
    const lines = csv.split('\r\n')
    expect(lines[1]).toBe('"a, b"')
    expect(lines[2]).toBe('"he said ""hi"""')
    expect(lines[3]).toBe('"line1\nline2"')
  })

  it('leaves empty cells blank', () => {
    const props = [
      prop({ id: 't', name: 'Name', type: 'text', is_title: true, position: 0 }),
      prop({ id: 'x', name: 'X', type: 'text', position: 1 }),
    ]
    const csv = databaseToCsv(detail(props, [rec('r1', { t: 'only' })]))
    expect(csv.split('\r\n')[1]).toBe('only,')
  })
})

describe('safeDownloadName', () => {
  it('slugs a title and appends the extension', () => {
    expect(safeDownloadName('Metrics & Calculations', 'csv')).toBe('Metrics_Calculations.csv')
    expect(safeDownloadName('Sonja HQ — Spec v1.1', 'html')).toBe('Sonja_HQ_Spec_v1.1.html')
  })
  it('falls back to "download" for empty/garbage titles', () => {
    expect(safeDownloadName('', 'txt')).toBe('download.txt')
    expect(safeDownloadName(null, 'html')).toBe('download.html')
    expect(safeDownloadName('***', 'csv')).toBe('download.csv')
  })
})

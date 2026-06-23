import { describe, it, expect } from 'vitest'
import {
  parseNotionDatabaseId,
  mapNotionType,
  notionColorToHq,
  mapDatabaseSchema,
  extractCellValue,
  mapRecordValues,
  notionPageTitle,
  matchRecordsToPageIds,
} from '@/lib/databases/notion-import'

describe('parseNotionDatabaseId', () => {
  it('pulls the db id from a full URL and ignores the ?v= view id', () => {
    const url =
      'https://www.notion.so/myws/Metrics-2213eac45c3741fa8aebc373ce85af9c?v=ffffffffffffffffffffffffffffffff'
    expect(parseNotionDatabaseId(url)).toBe('2213eac4-5c37-41fa-8aeb-c373ce85af9c')
  })
  it('accepts a bare 32-hex id', () => {
    expect(parseNotionDatabaseId('2213eac45c3741fa8aebc373ce85af9c')).toBe(
      '2213eac4-5c37-41fa-8aeb-c373ce85af9c',
    )
  })
  it('accepts an already-dashed UUID', () => {
    expect(parseNotionDatabaseId('2213eac4-5c37-41fa-8aeb-c373ce85af9c')).toBe(
      '2213eac4-5c37-41fa-8aeb-c373ce85af9c',
    )
  })
  it('throws when no id is present', () => {
    expect(() => parseNotionDatabaseId('https://notion.so/just-a-title')).toThrow()
    expect(() => parseNotionDatabaseId('')).toThrow()
  })
})

describe('mapNotionType', () => {
  it('maps direct types', () => {
    expect(mapNotionType('title')).toEqual({ type: 'text', unmapped: false })
    expect(mapNotionType('rich_text')).toEqual({ type: 'text', unmapped: false })
    expect(mapNotionType('select')).toEqual({ type: 'select', unmapped: false })
    expect(mapNotionType('status')).toEqual({ type: 'status', unmapped: false })
    expect(mapNotionType('multi_select')).toEqual({ type: 'multi_select', unmapped: false })
    expect(mapNotionType('number')).toEqual({ type: 'number', unmapped: false })
    expect(mapNotionType('checkbox')).toEqual({ type: 'checkbox', unmapped: false })
    expect(mapNotionType('date')).toEqual({ type: 'date', unmapped: false })
    expect(mapNotionType('url')).toEqual({ type: 'url', unmapped: false })
    expect(mapNotionType('relation')).toEqual({ type: 'relation', unmapped: false })
  })
  it('maps created/edited time to date and email/phone to text without flagging', () => {
    expect(mapNotionType('created_time')).toEqual({ type: 'date', unmapped: false })
    expect(mapNotionType('email')).toEqual({ type: 'text', unmapped: false })
    expect(mapNotionType('phone_number')).toEqual({ type: 'text', unmapped: false })
  })
  it('flags formula/rollup/people/files/unknown as unmapped text snapshots', () => {
    for (const t of ['formula', 'rollup', 'people', 'files', 'created_by', 'who_knows']) {
      expect(mapNotionType(t)).toEqual({ type: 'text', unmapped: true })
    }
  })
})

describe('notionColorToHq', () => {
  it('strips the _background suffix', () => {
    expect(notionColorToHq('blue_background')).toBe('blue')
  })
  it('passes through plain colors and undefined', () => {
    expect(notionColorToHq('green')).toBe('green')
    expect(notionColorToHq(undefined)).toBeUndefined()
  })
})

describe('mapDatabaseSchema', () => {
  const db = {
    title: [{ plain_text: 'Metrics & ' }, { plain_text: 'Calculations' }],
    icon: { type: 'emoji', emoji: '📊' },
    description: [{ plain_text: 'KPI defs' }],
    properties: {
      Name: { id: 't', name: 'Name', type: 'title' },
      Status: {
        id: 's',
        name: 'Status',
        type: 'status',
        status: { options: [{ name: 'Done', color: 'green_background' }] },
      },
      Tags: {
        id: 'm',
        name: 'Tags',
        type: 'multi_select',
        multi_select: { options: [{ name: 'A', color: 'red' }] },
      },
      Ratio: { id: 'f', name: 'Ratio', type: 'formula' },
      Linked: { id: 'r', name: 'Linked', type: 'relation', relation: { database_id: 'target-db' } },
    },
  }

  it('extracts title, emoji icon, and description', () => {
    const s = mapDatabaseSchema(db)
    expect(s.title).toBe('Metrics & Calculations')
    expect(s.icon).toBe('📊')
    expect(s.description).toBe('KPI defs')
  })
  it('marks exactly one title property and assigns sequential positions', () => {
    const s = mapDatabaseSchema(db)
    expect(s.properties.filter((p) => p.is_title)).toHaveLength(1)
    expect(s.properties.find((p) => p.is_title)?.name).toBe('Name')
    expect(s.properties.map((p) => p.position)).toEqual([0, 1, 2, 3, 4])
  })
  it('carries select/status/multi_select options with normalized colors', () => {
    const s = mapDatabaseSchema(db)
    const status = s.properties.find((p) => p.name === 'Status')!
    expect(status.config.options).toEqual([{ name: 'Done', color: 'green' }])
    const tags = s.properties.find((p) => p.name === 'Tags')!
    expect(tags.config.options).toEqual([{ name: 'A', color: 'red' }])
  })
  it('records the relation target db id', () => {
    const s = mapDatabaseSchema(db)
    const rel = s.properties.find((p) => p.name === 'Linked')!
    expect(rel.config.notionRelationDatabaseId).toBe('target-db')
  })
  it('reports unmapped columns (formula) and snapshots their source type', () => {
    const s = mapDatabaseSchema(db)
    expect(s.unmappedColumns).toEqual([{ name: 'Ratio', notionType: 'formula' }])
    const f = s.properties.find((p) => p.name === 'Ratio')!
    expect(f.type).toBe('text')
    expect(f.config.importedFromNotionType).toBe('formula')
  })
  it('falls back to a default title when missing', () => {
    expect(mapDatabaseSchema({}).title).toBe('Untitled database')
    expect(mapDatabaseSchema({ icon: { type: 'external' } }).icon).toBeNull()
  })
})

describe('extractCellValue', () => {
  it('handles each direct type', () => {
    expect(extractCellValue({ type: 'title', title: [{ plain_text: 'Hi' }] })).toBe('Hi')
    expect(extractCellValue({ type: 'rich_text', rich_text: [{ plain_text: 'a' }, { plain_text: 'b' }] })).toBe('ab')
    expect(extractCellValue({ type: 'select', select: { name: 'X' } })).toBe('X')
    expect(extractCellValue({ type: 'status', status: { name: 'Done' } })).toBe('Done')
    expect(extractCellValue({ type: 'multi_select', multi_select: [{ name: 'A' }, { name: 'B' }] })).toEqual(['A', 'B'])
    expect(extractCellValue({ type: 'number', number: 5 })).toBe(5)
    expect(extractCellValue({ type: 'checkbox', checkbox: true })).toBe(true)
    expect(extractCellValue({ type: 'checkbox', checkbox: false })).toBe(false)
    expect(extractCellValue({ type: 'date', date: { start: '2026-06-21' } })).toBe('2026-06-21')
    expect(extractCellValue({ type: 'url', url: 'https://x.com' })).toBe('https://x.com')
    expect(extractCellValue({ type: 'relation', relation: [{ id: 'p1' }, { id: 'p2' }] })).toEqual(['p1', 'p2'])
  })
  it('returns null for empty/missing cells', () => {
    expect(extractCellValue(undefined)).toBeNull()
    expect(extractCellValue({ type: 'select', select: null })).toBeNull()
    expect(extractCellValue({ type: 'number', number: null })).toBeNull()
    expect(extractCellValue({ type: 'date', date: null })).toBeNull()
    expect(extractCellValue({ type: 'title', title: [] })).toBeNull()
  })
  it('snapshots formula values by their inner type', () => {
    expect(extractCellValue({ type: 'formula', formula: { type: 'string', string: 'abc' } })).toBe('abc')
    expect(extractCellValue({ type: 'formula', formula: { type: 'number', number: 12 } })).toBe('12')
    expect(extractCellValue({ type: 'formula', formula: { type: 'boolean', boolean: true } })).toBe('Yes')
    expect(extractCellValue({ type: 'formula', formula: { type: 'date', date: { start: '2026-01-01' } } })).toBe('2026-01-01')
  })
  it('snapshots rollups', () => {
    expect(extractCellValue({ type: 'rollup', rollup: { type: 'number', number: 9 } })).toBe('9')
    expect(extractCellValue({ type: 'rollup', rollup: { type: 'array', array: [{ type: 'title', title: [{ plain_text: 'q' }] }] } })).toBe('q')
  })
  it('joins people/files names', () => {
    expect(extractCellValue({ type: 'people', people: [{ name: 'Sonja' }, { name: 'Chris' }] })).toBe('Sonja, Chris')
    expect(extractCellValue({ type: 'files', files: [{ name: 'a.pdf' }] })).toBe('a.pdf')
  })
  it('formats a unique_id with its prefix', () => {
    expect(extractCellValue({ type: 'unique_id', unique_id: { prefix: 'BPE', number: 903 } })).toBe('BPE-903')
    expect(extractCellValue({ type: 'unique_id', unique_id: { prefix: null, number: 7 } })).toBe('7')
  })
})

describe('mapRecordValues', () => {
  const props = mapDatabaseSchema({
    properties: {
      Name: { id: 't', name: 'Name', type: 'title' },
      Count: { id: 'c', name: 'Count', type: 'number' },
      Empty: { id: 'e', name: 'Empty', type: 'rich_text' },
    },
  }).properties

  it('keys values by the Notion property id and omits empty cells', () => {
    const page = {
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Row 1' }] },
        Count: { type: 'number', number: 3 },
        Empty: { type: 'rich_text', rich_text: [] },
      },
    }
    expect(mapRecordValues(page, props)).toEqual({ t: 'Row 1', c: 3 })
  })

  it('omits an empty multi_select array', () => {
    const propsMs = mapDatabaseSchema({
      properties: { Tags: { id: 'm', name: 'Tags', type: 'multi_select', multi_select: { options: [] } } },
    }).properties
    const page = { properties: { Tags: { type: 'multi_select', multi_select: [] } } }
    expect(mapRecordValues(page, propsMs)).toEqual({})
  })
})

describe('notionPageTitle', () => {
  it('returns the value of the title-typed property', () => {
    const page = {
      properties: {
        Status: { type: 'select', select: { name: 'Done' } },
        'Section Name': { type: 'title', title: [{ plain_text: 'In Transit ' }, { plain_text: 'Modal' }] },
      },
    }
    expect(notionPageTitle(page)).toBe('In Transit Modal')
  })

  it('returns an empty string when there is no title property', () => {
    expect(notionPageTitle({ properties: { X: { type: 'rich_text', rich_text: [] } } })).toBe('')
    expect(notionPageTitle({})).toBe('')
  })
})

describe('matchRecordsToPageIds', () => {
  it('matches records to page ids by title, case/space-insensitively', () => {
    const res = matchRecordsToPageIds(
      [{ id: 'rec-a', title: 'In Transit Modal' }, { id: 'rec-b', title: 'Sourced Equipment Modal' }],
      [{ id: 'page-1', title: 'in transit modal' }, { id: 'page-2', title: 'Sourced Equipment Modal ' }],
    )
    expect(res.pageIdByRecordId).toEqual({ 'rec-a': 'page-1', 'rec-b': 'page-2' })
    expect(res.unmatchedRecordTitles).toEqual([])
  })

  it('reports records with no matching page', () => {
    const res = matchRecordsToPageIds(
      [{ id: 'rec-a', title: 'Known' }, { id: 'rec-b', title: 'Missing' }],
      [{ id: 'page-1', title: 'Known' }],
    )
    expect(res.pageIdByRecordId).toEqual({ 'rec-a': 'page-1' })
    expect(res.unmatchedRecordTitles).toEqual(['Missing'])
  })

  it('pairs duplicate titles deterministically in input order (FIFO)', () => {
    const res = matchRecordsToPageIds(
      [{ id: 'rec-1', title: 'Dup' }, { id: 'rec-2', title: 'Dup' }],
      [{ id: 'page-x', title: 'Dup' }, { id: 'page-y', title: 'Dup' }],
    )
    expect(res.pageIdByRecordId).toEqual({ 'rec-1': 'page-x', 'rec-2': 'page-y' })
  })
})

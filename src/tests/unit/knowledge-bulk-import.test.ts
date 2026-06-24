/** Bulk-import parsing (Sprint 13 T3) — pure split/ref/title helpers. */
import { describe, it, expect } from 'vitest'
import { splitBulkText, bulkItemRef, parseBulkItems } from '@/lib/knowledge/bulk-import'

describe('splitBulkText', () => {
  it('splits one item per non-empty line', () => {
    expect(splitBulkText('a\n\n  b  \nc\n', 'lines')).toEqual(['a', 'b', 'c'])
  })
  it('splits one item per paragraph (blank-line separated)', () => {
    expect(splitBulkText('first\nline\n\nsecond para\n\n\nthird', 'paragraphs'))
      .toEqual(['first\nline', 'second para', 'third'])
  })
})

describe('bulkItemRef', () => {
  it('is deterministic and whitespace-insensitive at the edges', () => {
    expect(bulkItemRef('hello world')).toBe(bulkItemRef('  hello world  '))
  })
  it('differs for different content', () => {
    expect(bulkItemRef('a')).not.toBe(bulkItemRef('b'))
  })
})

describe('parseBulkItems', () => {
  it('extracts a title from the first non-empty line and dedupes within the batch', () => {
    const items = parseBulkItems('Buy pallets\n\nBuy pallets\n\nShip order #42\nline two', 'paragraphs')
    expect(items.map(i => i.title)).toEqual(['Buy pallets', 'Ship order #42'])
    expect(items).toHaveLength(2) // duplicate "Buy pallets" collapsed
    expect(items[0].ref).toBe(bulkItemRef('Buy pallets'))
  })
})

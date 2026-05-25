import { describe, it, expect } from 'vitest'
import {
  stripHtml,
  escapeHtml,
  parseTags,
  resolveKind,
  isValidEntity,
  ENTITIES,
  KINDS,
  SUPPORTED_MIME,
  MAX_BYTES,
} from '@/lib/knowledge/ingest'

describe('stripHtml', () => {
  it('removes script and style blocks entirely', () => {
    const html = '<p>visible</p><script>evil()</script><style>.x{}</style>'
    expect(stripHtml(html)).toBe('visible')
  })

  it('removes comments', () => {
    expect(stripHtml('<!-- hidden --><p>shown</p>')).toBe('shown')
  })

  it('decodes the supported HTML entities', () => {
    expect(stripHtml('<p>A&nbsp;B&amp;C&lt;d&gt;e&quot;f&#39;g</p>')).toBe('A B&C<d>e"f\'g')
  })

  it('collapses whitespace', () => {
    expect(stripHtml('<p>a\n\n  b\t\tc</p>')).toBe('a b c')
  })
})

describe('escapeHtml', () => {
  it('escapes the three structural characters', () => {
    expect(escapeHtml('<a>&"</a>')).toBe('&lt;a&gt;&amp;"&lt;/a&gt;')
  })
})

describe('parseTags', () => {
  it('splits, trims, lowercases, drops empties', () => {
    expect(parseTags(' Foo, BAR , ,baz')).toEqual(['foo', 'bar', 'baz'])
  })

  it('caps at 8 tags', () => {
    const raw = Array.from({ length: 20 }, (_, i) => `t${i}`).join(',')
    expect(parseTags(raw)).toHaveLength(8)
  })

  it('returns [] for empty input', () => {
    expect(parseTags('')).toEqual([])
    expect(parseTags('  ,  ,')).toEqual([])
  })
})

describe('resolveKind', () => {
  it('returns valid kinds verbatim', () => {
    for (const kind of KINDS) {
      expect(resolveKind(kind)).toBe(kind)
    }
  })

  it('falls back to doc for unknown kinds', () => {
    expect(resolveKind('bogus')).toBe('doc')
    expect(resolveKind('')).toBe('doc')
  })
})

describe('isValidEntity', () => {
  it('accepts the four canonical entities', () => {
    for (const entity of ENTITIES) {
      expect(isValidEntity(entity)).toBe(true)
    }
  })

  it('rejects anything else', () => {
    expect(isValidEntity('')).toBe(false)
    expect(isValidEntity('TM')).toBe(false) // case-sensitive
    expect(isValidEntity('sfc')).toBe(false) // sfc isn't in the Server Action's allowed set yet
  })
})

describe('exported constants', () => {
  it('SUPPORTED_MIME covers the documented set', () => {
    expect(SUPPORTED_MIME.has('text/html')).toBe(true)
    expect(SUPPORTED_MIME.has('application/pdf')).toBe(true)
    expect(SUPPORTED_MIME.has('text/plain')).toBe(true)
    expect(SUPPORTED_MIME.has('text/markdown')).toBe(true)
    expect(SUPPORTED_MIME.has('image/png')).toBe(false)
  })

  it('MAX_BYTES is 25 MB', () => {
    expect(MAX_BYTES).toBe(25 * 1024 * 1024)
  })
})

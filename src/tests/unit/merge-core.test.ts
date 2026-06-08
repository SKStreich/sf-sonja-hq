import { describe, it, expect } from 'vitest'
import {
  unionMergeEntities, unionMergeTags, assembleSourceText,
  buildMergePrompt, parseMergeResponse, fallbackMergeDraft,
  hasWorkspaceSource, resolveMergeKind, resolveMergeParentId, parseTagList,
  MERGE_CHAR_CAP, type MergeSource,
} from '@/lib/knowledge/merge-core'

function src(over: Partial<MergeSource> = {}): MergeSource {
  return { id: 'x', title: 't', kind: 'doc', entities: [], tags: [], body: 'b', parent_id: null, ...over }
}

describe('unionMergeEntities', () => {
  it('unions, de-dupes, drops invalid slugs, and canonically sorts', () => {
    const out = unionMergeEntities([
      src({ entities: ['personal', 'sfe'] }),
      src({ entities: ['sfe', 'tm', 'bogus'] }),
    ])
    // canonical order is tm · cthq · sfe · sfo · sfs · sfc · personal
    expect(out).toEqual(['tm', 'sfe', 'personal'])
    expect(out).not.toContain('bogus')
  })
  it('returns [] for no entities', () => {
    expect(unionMergeEntities([src(), src()])).toEqual([])
  })
})

describe('unionMergeTags', () => {
  it('lower-cases, de-dupes, preserves first-seen order', () => {
    const out = unionMergeTags([
      src({ tags: ['Alpha', 'beta'] }),
      src({ tags: ['BETA', 'gamma', 'alpha'] }),
    ])
    expect(out).toEqual(['alpha', 'beta', 'gamma'])
  })
  it('drops empties', () => {
    expect(unionMergeTags([src({ tags: ['', '  '] })])).toEqual([])
  })
})

describe('parseTagList', () => {
  it('splits, lower-cases, trims, de-dupes, drops empties', () => {
    expect(parseTagList('Alpha, beta ,  , ALPHA, gamma')).toEqual(['alpha', 'beta', 'gamma'])
  })
  it('returns [] for empty input', () => {
    expect(parseTagList('')).toEqual([])
    expect(parseTagList('  , ,')).toEqual([])
  })
})

describe('assembleSourceText', () => {
  it('labels each source and is not truncated under the cap', () => {
    const { text, truncated } = assembleSourceText([
      src({ title: 'A', kind: 'doc', body: 'alpha' }),
      src({ title: 'B', kind: 'idea', body: 'beta' }),
    ])
    expect(text).toContain('SOURCE 1: A [doc]')
    expect(text).toContain('SOURCE 2: B [idea]')
    expect(text).toContain('alpha')
    expect(text).toContain('beta')
    expect(truncated).toBe(false)
  })
  it('flags truncated and hard-cuts when over the cap', () => {
    const big = 'z'.repeat(MERGE_CHAR_CAP + 5000)
    const { text, truncated } = assembleSourceText([src({ body: big })])
    expect(truncated).toBe(true)
    expect(text.length).toBeLessThanOrEqual(MERGE_CHAR_CAP + 50)
    expect(text).toContain('[truncated]')
  })
  it('stops appending whole sources once the cap is reached', () => {
    const big = 'a'.repeat(MERGE_CHAR_CAP)
    const { text, truncated } = assembleSourceText([
      src({ title: 'First', body: big }),
      src({ title: 'Second', body: 'should-not-appear' }),
    ])
    expect(truncated).toBe(true)
    expect(text).not.toContain('should-not-appear')
  })
})

describe('buildMergePrompt', () => {
  it('includes the lossless rules, the delimiter, and the source text', () => {
    const p = buildMergePrompt('SOURCE TEXT HERE')
    expect(p).toContain('lossless union')
    expect(p).toContain('Source notes & conflicts')
    expect(p).toContain('---BODY---')
    expect(p).toContain('SOURCE TEXT HERE')
  })
})

describe('parseMergeResponse', () => {
  it('parses TITLE / TYPE / body', () => {
    const out = parseMergeResponse('TITLE: My Merge\nTYPE: decision\n---BODY---\n# Heading\n\ncontent')
    expect(out.title).toBe('My Merge')
    expect(out.type_hint).toBe('decision')
    expect(out.body).toBe('# Heading\n\ncontent')
  })
  it('falls back to strategy for an invalid type', () => {
    const out = parseMergeResponse('TITLE: X\nTYPE: nonsense\n---BODY---\nbody')
    expect(out.type_hint).toBe('strategy')
  })
  it('derives a title from the first heading when delimiter is missing', () => {
    const out = parseMergeResponse('## Just a body\n\nmore text')
    expect(out.title).toBe('Just a body')
    expect(out.body).toContain('Just a body')
  })
  it('caps the title length', () => {
    const out = parseMergeResponse('TITLE: ' + 'y'.repeat(200) + '\n---BODY---\nb')
    expect(out.title.length).toBe(120)
  })
})

describe('fallbackMergeDraft', () => {
  it('builds a per-section body and a combined title', () => {
    const out = fallbackMergeDraft([
      src({ title: 'One', body: 'first' }),
      src({ title: 'Two', body: 'second' }),
    ])
    expect(out.title).toContain('One')
    expect(out.title).toContain('Two')
    expect(out.body).toContain('## One')
    expect(out.body).toContain('## Two')
    expect(out.body).toContain('without AI')
  })
})

describe('workspace re-parenting rules', () => {
  it('hasWorkspaceSource detects a workspace page', () => {
    expect(hasWorkspaceSource([src({ kind: 'doc' }), src({ kind: 'workspace' })])).toBe(true)
    expect(hasWorkspaceSource([src({ kind: 'doc' }), src({ kind: 'idea' })])).toBe(false)
  })

  it('resolveMergeKind forces workspace when any source is a workspace page', () => {
    expect(resolveMergeKind([src({ kind: 'workspace' }), src({ kind: 'doc' })], 'doc')).toBe('workspace')
  })
  it('resolveMergeKind honors a valid suggestion otherwise', () => {
    expect(resolveMergeKind([src({ kind: 'doc' }), src({ kind: 'idea' })], 'idea')).toBe('idea')
  })
  it('resolveMergeKind defaults to doc for an invalid/absent suggestion', () => {
    expect(resolveMergeKind([src({ kind: 'doc' }), src({ kind: 'note' })], 'bogus')).toBe('doc')
    expect(resolveMergeKind([src({ kind: 'doc' }), src({ kind: 'note' })], null)).toBe('doc')
  })

  it('resolveMergeParentId inherits the common parent of all workspace sources', () => {
    const out = resolveMergeParentId([
      src({ id: 'a', kind: 'workspace', parent_id: 'p1' }),
      src({ id: 'b', kind: 'workspace', parent_id: 'p1' }),
    ])
    expect(out).toBe('p1')
  })
  it('resolveMergeParentId returns null when parents diverge', () => {
    const out = resolveMergeParentId([
      src({ id: 'a', kind: 'workspace', parent_id: 'p1' }),
      src({ id: 'b', kind: 'workspace', parent_id: 'p2' }),
    ])
    expect(out).toBeNull()
  })
  it('resolveMergeParentId returns null when the common parent is itself a source', () => {
    const out = resolveMergeParentId([
      src({ id: 'p1', kind: 'workspace', parent_id: null }),
      src({ id: 'b', kind: 'workspace', parent_id: 'p1' }),
    ])
    expect(out).toBeNull()
  })
  it('resolveMergeParentId returns null for non-workspace merges', () => {
    expect(resolveMergeParentId([src({ kind: 'doc' }), src({ kind: 'idea' })])).toBeNull()
  })
})

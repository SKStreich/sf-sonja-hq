import { describe, it, expect } from 'vitest'
import {
  sortEntitySlugs,
  fetchEntryEntityMap,
  fetchEntryIdsForEntity,
  fetchProjectEntityMap,
} from '@/lib/entities/multi-entity'

/**
 * Minimal chainable Supabase mock. Every builder method returns `this`, and the
 * builder is awaitable (thenable) resolving to `{ data }`. `data` is the rows
 * the last `.from()` was primed with.
 */
function mockSupabase(rowsByTable: Record<string, any[]>) {
  let current: any[] = []
  const builder: any = {
    select: () => builder,
    in: () => builder,
    eq: () => builder,
    order: () => builder,
    then: (resolve: (v: { data: any[] }) => void) => resolve({ data: current }),
  }
  return {
    from: (table: string) => {
      current = rowsByTable[table] ?? []
      return builder
    },
  }
}

describe('sortEntitySlugs()', () => {
  it('orders into canonical tm·sf·sfe·sfc·personal', () => {
    expect(sortEntitySlugs(['personal', 'sfe', 'tm'])).toEqual(['tm', 'sfe', 'personal'])
  })
  it('de-dupes', () => {
    expect(sortEntitySlugs(['sf', 'sf', 'tm'])).toEqual(['tm', 'sf'])
  })
  it('puts unknown slugs last but keeps known order', () => {
    expect(sortEntitySlugs(['mystery', 'sf', 'tm'])).toEqual(['tm', 'sf', 'mystery'])
  })
  it('handles empty input', () => {
    expect(sortEntitySlugs([])).toEqual([])
  })
})

describe('fetchEntryEntityMap()', () => {
  it('groups junction rows by entry_id and sorts each set', async () => {
    const sb = mockSupabase({
      knowledge_entry_entities: [
        { entry_id: 'a', entity: 'personal' },
        { entry_id: 'a', entity: 'tm' },
        { entry_id: 'b', entity: 'sf' },
      ],
    })
    const map = await fetchEntryEntityMap(sb, ['a', 'b'])
    expect(map).toEqual({ a: ['tm', 'personal'], b: ['sf'] })
  })

  it('short-circuits on empty id list (no query)', async () => {
    const sb = mockSupabase({ knowledge_entry_entities: [{ entry_id: 'x', entity: 'tm' }] })
    expect(await fetchEntryEntityMap(sb, [])).toEqual({})
  })
})

describe('fetchEntryIdsForEntity()', () => {
  it('returns de-duped entry ids for a slug', async () => {
    const sb = mockSupabase({
      knowledge_entry_entities: [
        { entry_id: 'a' }, { entry_id: 'a' }, { entry_id: 'c' },
      ],
    })
    expect(await fetchEntryIdsForEntity(sb, 'sf')).toEqual(['a', 'c'])
  })
})

describe('fetchProjectEntityMap()', () => {
  it('groups entity_id UUIDs by project_id', async () => {
    const sb = mockSupabase({
      project_entities: [
        { project_id: 'p1', entity_id: 'e1' },
        { project_id: 'p1', entity_id: 'e2' },
        { project_id: 'p2', entity_id: 'e1' },
      ],
    })
    const map = await fetchProjectEntityMap(sb, ['p1', 'p2'])
    expect(map).toEqual({ p1: ['e1', 'e2'], p2: ['e1'] })
  })

  it('short-circuits on empty id list', async () => {
    const sb = mockSupabase({ project_entities: [{ project_id: 'p', entity_id: 'e' }] })
    expect(await fetchProjectEntityMap(sb, [])).toEqual({})
  })
})

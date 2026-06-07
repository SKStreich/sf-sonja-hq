import { describe, it, expect } from 'vitest'
import {
  sortEntitySlugs,
  fetchEntryEntityMap,
  fetchEntryIdsForEntity,
  fetchProjectEntityMap,
  setEntryEntities,
  setProjectEntities,
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

/**
 * Write-side mock: records upsert payloads and the not-in delete predicate so we
 * can assert the reconcile (upsert desired + delete removed) shape.
 */
function mockWriteSupabase() {
  const calls: { upserts: any[]; notIn: Array<[string, string]> } = { upserts: [], notIn: [] }
  const builder: any = {
    upsert: (rows: any[]) => { calls.upserts.push(rows); return { error: null } },
    delete: () => builder,
    eq: () => builder,
    not: (col: string, _op: string, val: string) => { calls.notIn.push([col, val]); return { error: null } },
  }
  return { sb: { from: () => builder }, calls }
}

describe('setEntryEntities()', () => {
  it('upserts the sorted desired set and prunes anything not in it', async () => {
    const { sb, calls } = mockWriteSupabase()
    await setEntryEntities(sb, 'e1', 'org-1', ['personal', 'tm'])
    expect(calls.upserts[0]).toEqual([
      { entry_id: 'e1', entity: 'tm', org_id: 'org-1' },
      { entry_id: 'e1', entity: 'personal', org_id: 'org-1' },
    ])
    expect(calls.notIn[0]).toEqual(['entity', '(tm,personal)'])
  })

  it('throws on an empty set (≥1-entity guard)', async () => {
    const { sb } = mockWriteSupabase()
    await expect(setEntryEntities(sb, 'e1', 'org-1', [])).rejects.toThrow('At least one entity is required')
  })
})

describe('setProjectEntities()', () => {
  it('upserts the de-duped id set and prunes the rest', async () => {
    const { sb, calls } = mockWriteSupabase()
    await setProjectEntities(sb, 'p1', 'org-1', ['e1', 'e2', 'e1'])
    expect(calls.upserts[0]).toEqual([
      { project_id: 'p1', entity_id: 'e1', org_id: 'org-1' },
      { project_id: 'p1', entity_id: 'e2', org_id: 'org-1' },
    ])
    expect(calls.notIn[0]).toEqual(['entity_id', '(e1,e2)'])
  })

  it('throws on an empty set (≥1-entity guard)', async () => {
    const { sb } = mockWriteSupabase()
    await expect(setProjectEntities(sb, 'p1', 'org-1', [])).rejects.toThrow('At least one entity is required')
  })
})

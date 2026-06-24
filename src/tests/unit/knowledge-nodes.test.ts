import { describe, it, expect } from 'vitest'
import {
  entryKindToNodeType,
  buildNodes,
  filterNodesByType,
  countNodesByType,
  TYPE_FILTERS,
} from '@/lib/knowledge/nodes'
import type { KnowledgeEntry } from '@/app/api/knowledge/actions'
import type { HqDatabase } from '@/lib/databases/types'
import type { VaultEntry } from '@/app/api/knowledge/vault'

function entry(partial: Partial<KnowledgeEntry> & Pick<KnowledgeEntry, 'id' | 'kind'>): KnowledgeEntry {
  return {
    access: 'standard', entities: ['tm'], title: 't', body: null, summary: null,
    type_hint: null, idea_status: null, status: 'active', tags: [], source: 'manual',
    source_ref: null, storage_path: null, mime_type: null, size_bytes: null, confidence: null,
    classification_overridden: false, version: 1, created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z', user_id: 'u1', parent_id: null,
    ...partial,
  } as KnowledgeEntry
}

const db = (over: Partial<HqDatabase> & Pick<HqDatabase, 'id'>): HqDatabase => ({
  org_id: 'o1', title: 'DB', icon: null, description: null, created_by: 'u1',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  entities: ['tm'], record_count: 0, ...over,
})

const vault = (over: Partial<VaultEntry> & Pick<VaultEntry, 'id'>): VaultEntry => ({
  title: 'V', mime_type: null, size_bytes: null, entities: ['personal'], tags: [],
  summary: null, created_at: '2026-01-01T00:00:00Z', user_id: 'u1', ...over,
})

describe('entryKindToNodeType', () => {
  it('maps workspace→page and keeps doc/idea/note/chat', () => {
    expect(entryKindToNodeType('workspace')).toBe('page')
    expect(entryKindToNodeType('doc')).toBe('doc')
    expect(entryKindToNodeType('idea')).toBe('idea')
    expect(entryKindToNodeType('note')).toBe('note')
    expect(entryKindToNodeType('chat')).toBe('chat')
  })
  it('drops critique and unknown kinds', () => {
    expect(entryKindToNodeType('critique')).toBeNull()
    expect(entryKindToNodeType('whatever')).toBeNull()
  })
})

describe('buildNodes', () => {
  it('unions the three stores and drops critique', () => {
    const nodes = buildNodes({
      entries: [
        entry({ id: 'e1', kind: 'doc' }),
        entry({ id: 'e2', kind: 'workspace' }),
        entry({ id: 'e3', kind: 'critique' }),
      ],
      databases: [db({ id: 'd1' })],
      vault: [vault({ id: 'v1' })],
    })
    expect(nodes.map(n => n.id).sort()).toEqual(['d1', 'e1', 'e2', 'v1'])
    expect(nodes.find(n => n.id === 'e2')!.type).toBe('page')
    expect(nodes.find(n => n.id === 'd1')!.type).toBe('database')
    expect(nodes.find(n => n.id === 'v1')!.type).toBe('vault')
  })

  it('carries the source payload and entities on each node', () => {
    const nodes = buildNodes({ entries: [entry({ id: 'e1', kind: 'doc', entities: ['tm', 'sfe'] })], databases: [], vault: [] })
    expect(nodes[0].entry?.id).toBe('e1')
    expect(nodes[0].entities).toEqual(['tm', 'sfe'])
  })

  it('sorts newest-updated first across stores', () => {
    const nodes = buildNodes({
      entries: [entry({ id: 'old', kind: 'note', updated_at: '2026-01-01T00:00:00Z' })],
      databases: [db({ id: 'new', updated_at: '2026-06-01T00:00:00Z' })],
      vault: [vault({ id: 'mid', created_at: '2026-03-01T00:00:00Z' })],
    })
    expect(nodes.map(n => n.id)).toEqual(['new', 'mid', 'old'])
  })
})

describe('filterNodesByType', () => {
  const nodes = buildNodes({
    entries: [entry({ id: 'e1', kind: 'doc' }), entry({ id: 'p1', kind: 'workspace' })],
    databases: [db({ id: 'd1' })],
    vault: [],
  })
  it('returns everything for "all"', () => {
    expect(filterNodesByType(nodes, 'all')).toHaveLength(3)
  })
  it('narrows to a single type', () => {
    expect(filterNodesByType(nodes, 'page').map(n => n.id)).toEqual(['p1'])
    expect(filterNodesByType(nodes, 'database').map(n => n.id)).toEqual(['d1'])
  })
  it('passes the inbox set through unchanged (it is scoped server-side)', () => {
    // Inbox isn't a node type — the hub feeds an already-scoped list, so the
    // filter must not narrow by type (it would otherwise return []).
    expect(filterNodesByType(nodes, 'inbox')).toHaveLength(3)
  })
})

describe('countNodesByType', () => {
  it('tallies each type with zeros for absent ones', () => {
    const nodes = buildNodes({
      entries: [entry({ id: 'e1', kind: 'doc' }), entry({ id: 'e2', kind: 'doc' })],
      databases: [db({ id: 'd1' })],
      vault: [],
    })
    const c = countNodesByType(nodes)
    expect(c.doc).toBe(2)
    expect(c.database).toBe(1)
    expect(c.vault).toBe(0)
    expect(c.page).toBe(0)
  })
})

describe('TYPE_FILTERS', () => {
  it('leads with All and exposes Pages/Databases/Vault as types', () => {
    expect(TYPE_FILTERS[0].value).toBe('all')
    const values = TYPE_FILTERS.map(t => t.value)
    expect(values).toContain('page')
    expect(values).toContain('database')
    expect(values).toContain('vault')
  })
  it('includes the 📥 Inbox triage filter as a peer of Vault', () => {
    const inbox = TYPE_FILTERS.find(t => t.value === 'inbox')
    expect(inbox).toBeDefined()
    expect(inbox!.label).toContain('Inbox')
  })
})

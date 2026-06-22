import { describe, it, expect } from 'vitest'
import { buildTree, countTree } from '@/lib/knowledge/tree'
import type { KnowledgeNode, KnowledgeNodeType } from '@/lib/knowledge/nodes'

// Minimal node factory. `parent` sets entry.parent_id (only entry-backed nodes
// can have a parent); `updatedAt` controls sort order.
function node(
  id: string,
  opts: { type?: KnowledgeNodeType; parent?: string | null; updatedAt?: string } = {},
): KnowledgeNode {
  const type = opts.type ?? 'page'
  const entryBacked = type === 'page' || type === 'doc' || type === 'idea' || type === 'note' || type === 'chat'
  return {
    id,
    type,
    title: id,
    entities: [],
    updatedAt: opts.updatedAt ?? '2026-01-01T00:00:00Z',
    ...(entryBacked
      ? { entry: { id, kind: 'workspace', parent_id: opts.parent ?? null } as any }
      : {}),
  }
}

describe('buildTree', () => {
  it('flat list with no parents → all roots, newest first', () => {
    const tree = buildTree([
      node('a', { updatedAt: '2026-01-01T00:00:00Z' }),
      node('b', { updatedAt: '2026-03-01T00:00:00Z' }),
      node('c', { updatedAt: '2026-02-01T00:00:00Z' }),
    ])
    expect(tree.map((t) => t.node.id)).toEqual(['b', 'c', 'a'])
    expect(tree.every((t) => t.depth === 0 && t.children.length === 0)).toBe(true)
  })

  it('nests children under their parent with increasing depth', () => {
    const tree = buildTree([
      node('root'),
      node('child', { parent: 'root' }),
      node('grandchild', { parent: 'child' }),
    ])
    expect(tree).toHaveLength(1)
    expect(tree[0].node.id).toBe('root')
    expect(tree[0].depth).toBe(0)
    expect(tree[0].children[0].node.id).toBe('child')
    expect(tree[0].children[0].depth).toBe(1)
    expect(tree[0].children[0].children[0].node.id).toBe('grandchild')
    expect(tree[0].children[0].children[0].depth).toBe(2)
  })

  it('promotes an orphan (parent not in set) to root', () => {
    const tree = buildTree([node('orphan', { parent: 'missing' })])
    expect(tree).toHaveLength(1)
    expect(tree[0].node.id).toBe('orphan')
    expect(tree[0].depth).toBe(0)
  })

  it('sorts sibling children newest-first', () => {
    const tree = buildTree([
      node('p'),
      node('old', { parent: 'p', updatedAt: '2026-01-01T00:00:00Z' }),
      node('new', { parent: 'p', updatedAt: '2026-05-01T00:00:00Z' }),
    ])
    expect(tree[0].children.map((c) => c.node.id)).toEqual(['new', 'old'])
  })

  it('is cycle-safe and lossless (A↔B parent loop)', () => {
    const tree = buildTree([
      node('a', { parent: 'b' }),
      node('b', { parent: 'a' }),
    ])
    // both nodes survive; no infinite recursion
    expect(countTree(tree)).toBe(2)
  })

  it('a node that is its own parent is treated as a root', () => {
    const tree = buildTree([node('self', { parent: 'self' })])
    expect(tree).toHaveLength(1)
    expect(tree[0].node.id).toBe('self')
  })

  it('databases / vault nodes (no entry) are always roots', () => {
    const tree = buildTree([
      node('page'),
      node('db', { type: 'database' }),
      node('v', { type: 'vault' }),
    ])
    expect(tree).toHaveLength(3)
  })

  it('extraLinks nest a database under its host page (embed → tree edge)', () => {
    const tree = buildTree(
      [node('page'), node('db', { type: 'database' })],
      { extraLinks: [{ parentId: 'page', childId: 'db' }] },
    )
    expect(tree).toHaveLength(1)
    expect(tree[0].node.id).toBe('page')
    expect(tree[0].children.map((c) => c.node.id)).toEqual(['db'])
  })

  it('extraLinks pointing at a missing parent leave the child at root', () => {
    const tree = buildTree(
      [node('db', { type: 'database' })],
      { extraLinks: [{ parentId: 'gone', childId: 'db' }] },
    )
    expect(tree).toHaveLength(1)
    expect(tree[0].node.id).toBe('db')
  })
})

describe('countTree', () => {
  it('counts every node in the forest', () => {
    const tree = buildTree([
      node('r'),
      node('c1', { parent: 'r' }),
      node('c2', { parent: 'r' }),
      node('g', { parent: 'c1' }),
      node('solo', { type: 'database' }),
    ])
    expect(countTree(tree)).toBe(5)
  })
})

// Unified Knowledge Browser — Tree display model (Phase U3b, spec OQ-5).
//
// Builds a containment tree from the flat KnowledgeNode list. Today the only
// containment edge is knowledge_entries.parent_id (workspace pages nest under a
// parent page); every other node type has no parent and sits at the root. When
// U3c adds the generic knowledge_node_links graph + DB embeds, this builder
// gains those edges — the renderer stays the same.
//
// PURE (no I/O): unit-tested, shared by the renderer. Cycle-safe and lossless —
// every input node appears exactly once in the output (orphans whose parent was
// filtered out, and any node caught in a parent_id cycle, are promoted to root).

import type { KnowledgeNode } from './nodes'

export interface TreeNode {
  node: KnowledgeNode
  children: TreeNode[]
  depth: number
}

const byDateDesc = (a: KnowledgeNode, b: KnowledgeNode) => b.updatedAt.localeCompare(a.updatedAt)

/** Build the containment forest. Roots first (newest-touched), each child list
 *  likewise sorted. A node is a child iff its entry.parent_id resolves to
 *  another node in the set (and isn't itself); otherwise it's a root. */
export function buildTree(nodes: KnowledgeNode[]): TreeNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const childrenOf = new Map<string, KnowledgeNode[]>()
  const roots: KnowledgeNode[] = []

  for (const n of nodes) {
    const pid = n.entry?.parent_id ?? null
    if (pid && pid !== n.id && byId.has(pid)) {
      const arr = childrenOf.get(pid) ?? []
      arr.push(n)
      childrenOf.set(pid, arr)
    } else {
      roots.push(n)
    }
  }

  const visited = new Set<string>()
  const build = (n: KnowledgeNode, depth: number): TreeNode => {
    visited.add(n.id)
    const children = (childrenOf.get(n.id) ?? [])
      .filter((c) => !visited.has(c.id)) // guard against parent_id cycles
      .sort(byDateDesc)
      .map((c) => build(c, depth + 1))
    return { node: n, children, depth }
  }

  const tree = roots.sort(byDateDesc).map((r) => build(r, 0))

  // Lossless: any node never reached (a cycle with no root) becomes a root so
  // it's never silently dropped from the browser.
  for (const n of nodes) {
    if (!visited.has(n.id)) tree.push(build(n, 0))
  }
  return tree
}

/** Total node count in a subtree (incl. the root), for "N nested" affordances. */
export function countTree(tree: TreeNode[]): number {
  return tree.reduce((sum, t) => sum + 1 + countTree(t.children), 0)
}

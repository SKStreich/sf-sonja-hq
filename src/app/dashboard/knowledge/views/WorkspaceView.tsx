'use client'
/**
 * Workspace pages — Notion-style hierarchical Markdown surfaces.
 *
 * Slice 1: tree of workspace entries (kind='workspace') with create / move /
 * delete and click-through to /dashboard/knowledge/[id]. The detail page
 * renders the split-pane Markdown editor (see EntryDetail.MarkdownSplitPane).
 */
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  listWorkspaceTree, createWorkspacePage, deleteWorkspacePage,
  type WorkspaceNode,
} from '@/app/api/knowledge/workspace'

interface TreeNode extends WorkspaceNode {
  children: TreeNode[]
}

function buildTree(nodes: WorkspaceNode[]): TreeNode[] {
  const byId = new Map<string, TreeNode>()
  nodes.forEach(n => byId.set(n.id, { ...n, children: [] }))
  const roots: TreeNode[] = []
  byId.forEach(n => {
    if (n.parent_id && byId.has(n.parent_id)) {
      byId.get(n.parent_id)!.children.push(n)
    } else {
      roots.push(n)
    }
  })
  // Sort children alphabetically for stable nesting; roots stay in updated_at order.
  const sortKids = (n: TreeNode) => {
    n.children.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''))
    n.children.forEach(sortKids)
  }
  roots.forEach(sortKids)
  return roots
}

export function WorkspaceView() {
  const router = useRouter()
  const [nodes, setNodes] = useState<WorkspaceNode[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const refresh = () => {
    setLoading(true)
    listWorkspaceTree()
      .then(n => setNodes(n))
      .catch(e => setErr(e?.message ?? 'Load failed'))
      .finally(() => setLoading(false))
  }

  useEffect(refresh, [])

  const tree = buildTree(nodes)

  const createTopLevel = () => {
    setErr('')
    startBusy(async () => {
      try {
        const { id } = await createWorkspacePage({ parentId: null, title: 'Untitled page' })
        router.push(`/dashboard/knowledge/${id}`)
      } catch (e: any) { setErr(e?.message ?? 'Create failed') }
    })
  }

  const createChild = (parentId: string) => {
    setErr('')
    startBusy(async () => {
      try {
        const { id } = await createWorkspacePage({ parentId, title: 'Untitled page' })
        setExpanded(s => new Set(s).add(parentId))
        router.push(`/dashboard/knowledge/${id}`)
      } catch (e: any) { setErr(e?.message ?? 'Create failed') }
    })
  }

  const remove = (id: string) => {
    if (!confirm('Delete this page? Direct child pages will be re-parented to this page’s parent.')) return
    startBusy(async () => {
      try { await deleteWorkspacePage(id); refresh() }
      catch (e: any) { setErr(e?.message ?? 'Delete failed') }
    })
  }

  const toggle = (id: string) => {
    setExpanded(s => {
      const next = new Set(s)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Workspace pages</h2>
          <p className="text-xs text-gray-500">Notion-style hierarchical Markdown. Pages live in the same Knowledge Hub as everything else.</p>
        </div>
        <button onClick={createTopLevel} disabled={busy}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
          + New page
        </button>
      </div>

      {err && <div className="m-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <div className="p-2">
        {loading ? (
          <p className="px-3 py-4 text-sm text-gray-500">Loading pages…</p>
        ) : tree.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <p className="text-sm text-gray-500">No workspace pages yet.</p>
            <p className="mt-1 text-xs text-gray-400">Click <strong>+ New page</strong> to create your first one.</p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {tree.map(n => (
              <TreeItem
                key={n.id}
                node={n}
                depth={0}
                expanded={expanded}
                onToggle={toggle}
                onCreateChild={createChild}
                onDelete={remove}
                busy={busy}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TreeItem({
  node, depth, expanded, onToggle, onCreateChild, onDelete, busy,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  onToggle: (id: string) => void
  onCreateChild: (id: string) => void
  onDelete: (id: string) => void
  busy: boolean
}) {
  const isOpen = expanded.has(node.id)
  return (
    <li>
      <div
        className="group flex items-center gap-1 rounded px-2 py-1.5 text-sm hover:bg-gray-50"
        style={{ paddingLeft: 8 + depth * 16 }}
      >
        {node.children.length > 0 ? (
          <button onClick={() => onToggle(node.id)}
            className="flex h-4 w-4 shrink-0 items-center justify-center text-xs text-gray-400 hover:text-gray-700">
            {isOpen ? '▾' : '▸'}
          </button>
        ) : (
          <span className="h-4 w-4 shrink-0" />
        )}
        <span className="text-gray-400">📄</span>
        <Link href={`/dashboard/knowledge/${node.id}`}
          className="flex-1 truncate text-gray-900 hover:text-indigo-700">
          {node.title || 'Untitled page'}
        </Link>
        <span className="text-[10px] uppercase tracking-wider text-gray-400">{node.entity}</span>
        <div className="hidden gap-1 group-hover:flex">
          <button onClick={() => onCreateChild(node.id)} disabled={busy}
            title="Add child page"
            className="rounded px-1.5 py-0.5 text-xs text-gray-500 hover:bg-gray-200 disabled:opacity-40">
            +
          </button>
          <button onClick={() => onDelete(node.id)} disabled={busy}
            title="Delete page"
            className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 disabled:opacity-40">
            ×
          </button>
        </div>
      </div>
      {isOpen && node.children.length > 0 && (
        <ul className="space-y-0.5">
          {node.children.map(c => (
            <TreeItem
              key={c.id}
              node={c}
              depth={depth + 1}
              expanded={expanded}
              onToggle={onToggle}
              onCreateChild={onCreateChild}
              onDelete={onDelete}
              busy={busy}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

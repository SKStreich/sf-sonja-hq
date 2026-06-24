'use client'
import { useState, useTransition, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  createEntry, deleteEntry, fileEntry,
  type KnowledgeEntry, type Kind, type Entity,
} from '@/app/api/knowledge/actions'
import { uploadKnowledgeFile } from '@/app/api/knowledge/upload'
import { uploadVaultFile, getVaultDownloadUrl, deleteVaultEntry, type VaultEntry } from '@/app/api/knowledge/vault'
import { listPendingForwardCountsByEntry } from '@/app/api/knowledge/shares'
import { listNodes, countInbox } from '@/app/api/knowledge/nodes'
import { listNodeLinks } from '@/app/api/knowledge/containment'
import type { NodeEdge } from '@/lib/knowledge/tree'
import { InsightsView } from './views/InsightsView'
import { VaultView } from './views/VaultView'
import { DatabasesView } from './views/DatabasesView'
import { NodeView } from './views/NodeView'
import {
  buildNodes, filterNodesByType, countNodesByType,
  TYPE_FILTERS, type KnowledgeNode, type TypeFilter,
} from '@/lib/knowledge/nodes'
import type { HqDatabase } from '@/lib/databases/types'
import { ChatDrawer } from './ChatDrawer'
import { MergeReviewModal } from './MergeReviewModal'
import { EntityMultiSelect } from '@/components/shared/EntityMultiSelect'
import { ENTITY_SELECT_OPTIONS } from '@/lib/entities/config'

const ENTITIES: { value: Entity | null; label: string }[] = [
  { value: null, label: 'All' },
  ...ENTITY_SELECT_OPTIONS,
]

interface Metrics {
  total: number
  byKind: Record<string, number>
  byEntity: Record<string, number>
  rawIdeas: number
  recentCount: number
}

interface Props {
  initialEntries: KnowledgeEntry[]
  initialVault: VaultEntry[]
  initialDatabases: HqDatabase[]
  metrics: Metrics
}

export function KnowledgeHub({ initialEntries, initialVault, initialDatabases, metrics }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [nodes, setNodes] = useState<KnowledgeNode[]>(() =>
    buildNodes({ entries: initialEntries, databases: initialDatabases, vault: initialVault }),
  )
  const [type, setType] = useState<TypeFilter>('all')
  const [display, setDisplay] = useState<'cards' | 'list' | 'tree'>('cards')
  const [insights, setInsights] = useState(false)
  const [openDbId, setOpenDbId] = useState<string | null>(null)
  const [entity, setEntity] = useState<Entity | null>(null)
  const [query, setQuery] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [chatTarget, setChatTarget] = useState<{ id: string | null; title?: string } | null>(null)
  const [pendingForwards, setPendingForwards] = useState<Record<string, number>>({})
  const [treeLinks, setTreeLinks] = useState<NodeEdge[]>([])
  // Inbox (triage_status='inbox') is a disjoint server scope from the main filed
  // feed (D4), loaded separately. Items have no entity until filed, so the queue
  // isn't narrowed by the entity/search filters — it's a global "to file" list.
  const [inboxNodes, setInboxNodes] = useState<KnowledgeNode[]>([])
  const [inboxCount, setInboxCount] = useState(0)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [mergeOpen, setMergeOpen] = useState(false)

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const clearSelection = () => setSelectedIds(new Set())
  const exitSelectMode = () => { setSelectMode(false); clearSelection() }

  useEffect(() => {
    let cancelled = false
    listPendingForwardCountsByEntry()
      .then(c => { if (!cancelled) setPendingForwards(c) })
      .catch(() => {})
    listNodeLinks()
      .then(l => { if (!cancelled) setTreeLinks(l) })
      .catch(() => {})
    listNodes({ triage: 'inbox' })
      .then(n => { if (!cancelled) setInboxNodes(n) })
      .catch(() => {})
    countInbox()
      .then(c => { if (!cancelled) setInboxCount(c) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  // Deep-link from the dashboard "📥 N to triage" chip lands on the Inbox filter.
  useEffect(() => {
    if (searchParams.get('filter') === 'inbox') setType('inbox')
  }, [searchParams])

  // Reload the inbox queue + badge count (after filing, or a delete).
  const refreshInbox = () => {
    listNodes({ triage: 'inbox' }).then(setInboxNodes).catch(() => {})
    countInbox().then(setInboxCount).catch(() => {})
  }

  const [loading, startLoad] = useTransition()

  // Entity + search hit the one server reader (OQ-2 app-code union). The Type
  // filter is a pure client-side narrowing of the already-loaded node set.
  const reload = (over: { entity?: Entity | null; query?: string } = {}) => {
    startLoad(async () => {
      setNodes(await listNodes({
        entity: over.entity !== undefined ? over.entity : entity,
        query: over.query !== undefined ? over.query : query,
      }))
    })
  }
  const handleSearch = (value: string) => { setQuery(value); reload({ query: value }) }
  const handleEntityChange = (e: Entity | null) => { setEntity(e); reload({ entity: e }) }

  // Selecting a content type clears the Insights overlay; leaving Databases
  // drops any open-database target.
  const selectType = (t: TypeFilter) => {
    setInsights(false)
    setType(t)
    if (t !== 'database') setOpenDbId(null)
  }
  const openDatabase = (id: string) => { setInsights(false); setType('database'); setOpenDbId(id) }
  const openVault = async (node: KnowledgeNode) => {
    window.open(await getVaultDownloadUrl(node.id), '_blank', 'noopener,noreferrer')
  }
  const handleDelete = async (id: string) => { await deleteEntry(id); reload(); refreshInbox() }
  // Filing moves an item out of the inbox and into the filed feed (D4) — refresh both.
  const handleFile = async (id: string, entities: string[]) => {
    await fileEntry(id, entities as Entity[])
    refreshInbox()
    reload()
  }

  const counts = useMemo(() => countNodesByType(nodes), [nodes])
  const entryList = useMemo(() => nodes.filter(n => n.entry).map(n => n.entry!), [nodes])
  const vaultEntries = useMemo(() => nodes.filter(n => n.type === 'vault').map(n => n.vault!), [nodes])
  const databaseList = useMemo(() => nodes.filter(n => n.type === 'database').map(n => n.database!), [nodes])
  const shownNodes = useMemo(
    () => (type === 'inbox' ? inboxNodes : filterNodesByType(nodes, type)),
    [nodes, inboxNodes, type],
  )
  const showingNodeView = !insights && type !== 'database' && type !== 'vault'

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      {/* Header */}
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Knowledge</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your source of truth — ideas, docs, chats, notes, and Tier-2 vault files, unified.
        </p>
      </header>

      {/* Metrics */}
      <div className="mb-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Metric label="Total entries" value={metrics.total} />
        <Metric label="Raw ideas" value={metrics.rawIdeas} hint={metrics.rawIdeas > 0 ? 'awaiting review' : 'inbox clear'} />
        <Metric label="Active last 7d" value={metrics.recentCount} />
        <Metric label="Vault files" value={counts.vault} tone="amber" />
      </div>

      {/* Type filter — Pages / Databases / Vault are types now, not view tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-1">
          {TYPE_FILTERS.map(t => {
            const active = !insights && type === t.value
            const count =
              t.value === 'all' ? nodes.length
              : t.value === 'inbox' ? inboxCount
              : counts[t.value]
            return (
              <button key={t.value} onClick={() => selectType(t.value)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                {t.label}
                <span className="ml-1 text-[10px] opacity-70">{count}</span>
              </button>
            )
          })}
        </div>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex flex-wrap items-center gap-1">
          {ENTITIES.map(e => (
            <button key={e.label} onClick={() => handleEntityChange(e.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                entity === e.value ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              {e.label}
            </button>
          ))}
        </div>
        <input
          value={query}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Search title or body…"
          className="ml-auto w-64 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400"
        />
      </div>

      {/* Display + actions */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {showingNodeView && type !== 'inbox' && (
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
              {([['cards', '▦ Cards'], ['list', '☰ List'], ['tree', '⛬ Tree']] as const).map(([d, label]) => (
                <button key={d} onClick={() => setDisplay(d)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    display === d ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => { setInsights(v => !v) }}
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              insights ? 'border-indigo-300 bg-indigo-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
            }`}>
            ✦ Insights
          </button>
        </div>
        <div className="flex items-center gap-2">
          {showingNodeView && type !== 'inbox' && (
            <button onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className={`rounded-md border px-3 py-1.5 text-sm font-medium ${
                selectMode
                  ? 'border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200'
                  : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              {selectMode ? 'Cancel select' : '⛙ Select to merge'}
            </button>
          )}
          <button onClick={() => setChatTarget({ id: null })}
            className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
            ✦ Ask Claude
          </button>
          <button onClick={() => setComposerOpen(true)}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">
            + New entry
          </button>
        </div>
      </div>

      {/* Active view */}
      <div className={loading ? 'opacity-60 transition-opacity' : ''}>
        {insights ? (
          <InsightsView entries={entryList} />
        ) : type === 'database' ? (
          <DatabasesView databases={databaseList} openDatabaseId={openDbId} />
        ) : type === 'vault' ? (
          <VaultView
            entries={vaultEntries}
            onDownload={async id => { window.open(await getVaultDownloadUrl(id), '_blank', 'noopener,noreferrer') }}
            onDelete={async id => { await deleteVaultEntry(id); reload() }}
            onUpload={async fd => { await uploadVaultFile(fd); reload() }}
          />
        ) : (
          <NodeView
            nodes={shownNodes}
            display={type === 'inbox' ? 'cards' : display}
            treeLinks={treeLinks}
            pendingForwards={pendingForwards}
            selectable={selectMode}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onChat={e => setChatTarget({ id: e.id, title: e.title ?? undefined })}
            onDelete={handleDelete}
            onOpenDatabase={openDatabase}
            onOpenVault={openVault}
            onFile={type === 'inbox' ? handleFile : undefined}
          />
        )}
      </div>

      {/* Merge action bar */}
      {selectMode && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto flex max-w-6xl items-center gap-4 px-6 py-3">
            <span className="text-sm text-gray-700">
              <strong>{selectedIds.size}</strong> selected
              {selectedIds.size < 2 && <span className="text-gray-400"> — pick at least 2 to merge</span>}
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={clearSelection}
                disabled={selectedIds.size === 0}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 disabled:opacity-40">
                Clear
              </button>
              <button onClick={() => setMergeOpen(true)}
                disabled={selectedIds.size < 2}
                className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
                Merge ({selectedIds.size})
              </button>
            </div>
          </div>
        </div>
      )}

      {mergeOpen && (
        <MergeReviewModal
          sourceIds={Array.from(selectedIds)}
          onClose={() => setMergeOpen(false)}
          onMerged={id => {
            setMergeOpen(false)
            exitSelectMode()
            router.push(`/dashboard/knowledge/${id}`)
          }}
        />
      )}

      {composerOpen && <Composer onClose={() => setComposerOpen(false)} onCreated={() => { setComposerOpen(false); reload() }} />}
      {chatTarget && (
        <ChatDrawer
          sourceEntryId={chatTarget.id}
          sourceTitle={chatTarget.title}
          onClose={() => setChatTarget(null)}
        />
      )}
    </div>
  )
}

function Metric({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'amber' | 'default' }) {
  const tint = tone === 'amber' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-white'
  return (
    <div className={`rounded-xl border ${tint} p-4`}>
      <p className="text-xs font-bold uppercase tracking-widest text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-gray-400">{hint}</p>}
    </div>
  )
}

function Composer({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [body, setBody] = useState('')
  const [entities, setEntities] = useState<Entity[]>(['personal'])
  const [kind, setKind] = useState<Kind>('note')
  const [busy, startBusy] = useTransition()
  const [error, setError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [uploading, setUploading] = useState<{ name: string } | null>(null)

  const handleSubmit = () => {
    if (!body.trim()) return
    setError('')
    startBusy(async () => {
      try {
        await createEntry({ body, entities, kind })
        onCreated()
      } catch (e: any) {
        setError(e.message ?? 'Failed to create')
      }
    })
  }

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (list.length === 0) return
    setError('')
    for (const file of list) {
      setUploading({ name: file.name })
      try {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('entities', JSON.stringify(entities))
        fd.append('kind', kind === 'chat' || kind === 'critique' ? 'doc' : kind)
        fd.append('tags', '')
        await uploadKnowledgeFile(fd)
      } catch (e: any) {
        setError(e.message ?? `Failed to upload ${file.name}`)
        setUploading(null)
        return
      }
    }
    setUploading(null)
    onCreated()
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (uploading) return
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void handleFiles(e.dataTransfer.files)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 p-6">
      <div className="w-full max-w-2xl rounded-xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-gray-900">New entry</h2>
          <button onClick={onClose} className="text-xl text-gray-400 hover:text-gray-600">×</button>
        </div>
        <div className="p-5">
          <textarea
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Paste a doc, write an idea, log a note… Claude will classify it."
            rows={8}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400"
          />

          {/* File dropzone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`mt-3 rounded-md border-2 border-dashed px-4 py-4 text-center text-xs transition-colors ${
              dragOver
                ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                : 'border-gray-200 bg-gray-50 text-gray-500'
            }`}
          >
            {uploading ? (
              <span>Uploading {uploading.name}…</span>
            ) : (
              <>
                <p>Drop a PDF, DOCX, XLSX, HTML, TXT, or Markdown file here</p>
                <p className="mt-1 text-[11px] text-gray-400">or</p>
                <label className="mt-1 inline-block cursor-pointer rounded-md border border-gray-300 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 hover:bg-gray-50">
                  Choose file
                  <input
                    type="file"
                    accept=".pdf,.docx,.xlsx,.html,.htm,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/html,text/plain,text/markdown"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files) void handleFiles(e.target.files)
                      e.target.value = ''
                    }}
                  />
                </label>
                <p className="mt-1 text-[11px] text-gray-400">Max 25 MB. Body text extracted automatically.</p>
              </>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <select value={kind} onChange={e => setKind(e.target.value as Kind)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900">
              <option value="note">Note</option>
              <option value="idea">Idea</option>
              <option value="doc">Doc</option>
            </select>
            <EntityMultiSelect options={ENTITY_SELECT_OPTIONS} selected={entities} onChange={v => setEntities(v as Entity[])} />
            {error && <span className="text-xs text-red-600">{error}</span>}
            <button onClick={handleSubmit} disabled={busy || !body.trim() || !!uploading}
              className="ml-auto rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

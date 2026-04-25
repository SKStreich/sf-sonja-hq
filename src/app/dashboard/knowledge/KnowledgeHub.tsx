'use client'
import { useState, useTransition, useMemo } from 'react'
import {
  listEntries, createEntry, deleteEntry,
  type KnowledgeEntry, type Kind, type Entity,
} from '@/app/api/knowledge/actions'
import { uploadKnowledgeFile } from '@/app/api/knowledge/upload'
import { listVaultEntries, uploadVaultFile, getVaultDownloadUrl, deleteVaultEntry, type VaultEntry } from '@/app/api/knowledge/vault'
import { CardView } from './views/CardView'
import { ListView } from './views/ListView'
import { InsightsView } from './views/InsightsView'
import { VaultView } from './views/VaultView'
import { ChatDrawer } from './ChatDrawer'

type ViewMode = 'card' | 'list' | 'insights' | 'vault'

const KINDS: { value: Kind | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'idea', label: 'Ideas' },
  { value: 'doc', label: 'Docs' },
  { value: 'chat', label: 'Chats' },
  { value: 'note', label: 'Notes' },
]

const ENTITIES: { value: Entity | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'tm', label: 'TM' },
  { value: 'sf', label: 'SF' },
  { value: 'sfe', label: 'SFE' },
  { value: 'personal', label: 'Personal' },
]

const VIEW_MODES: { value: ViewMode; label: string; icon: string }[] = [
  { value: 'card', label: 'Cards', icon: '▦' },
  { value: 'list', label: 'List', icon: '☰' },
  { value: 'insights', label: 'Insights', icon: '✦' },
  { value: 'vault', label: 'Vault', icon: '🔒' },
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
  metrics: Metrics
}

export function KnowledgeHub({ initialEntries, initialVault, metrics }: Props) {
  const [entries, setEntries] = useState(initialEntries)
  const [vault, setVault] = useState(initialVault)
  const [view, setView] = useState<ViewMode>('card')
  const [kind, setKind] = useState<Kind | null>(null)
  const [entity, setEntity] = useState<Entity | null>(null)
  const [query, setQuery] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [chatTarget, setChatTarget] = useState<{ id: string | null; title?: string } | null>(null)

  const [loading, startLoad] = useTransition()

  const refresh = () => {
    startLoad(async () => {
      if (view === 'vault') {
        setVault(await listVaultEntries())
      } else {
        setEntries(await listEntries({ kind, entity, query }))
      }
    })
  }

  const handleSearch = (value: string) => {
    setQuery(value)
    startLoad(async () => {
      setEntries(await listEntries({ kind, entity, query: value }))
    })
  }

  const handleKindChange = (k: Kind | null) => {
    setKind(k)
    startLoad(async () => {
      setEntries(await listEntries({ kind: k, entity, query }))
    })
  }

  const handleEntityChange = (e: Entity | null) => {
    setEntity(e)
    startLoad(async () => {
      setEntries(await listEntries({ kind, entity: e, query }))
    })
  }

  const visibleEntries = useMemo(() => {
    if (view === 'vault') return []
    return entries
  }, [entries, view])

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
        <Metric label="Vault files" value={vault.length} tone="amber" />
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1">
          {KINDS.map(k => (
            <button key={k.label} onClick={() => handleKindChange(k.value)}
              disabled={view === 'vault'}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                kind === k.value && view !== 'vault'
                  ? 'bg-indigo-600 text-white'
                  : 'text-gray-600 hover:bg-gray-100 disabled:opacity-40'
              }`}>
              {k.label}
              {k.value && metrics.byKind[k.value] !== undefined && (
                <span className="ml-1 text-[10px] opacity-70">{metrics.byKind[k.value]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="h-5 w-px bg-gray-200" />
        <div className="flex items-center gap-1">
          {ENTITIES.map(e => (
            <button key={e.label} onClick={() => handleEntityChange(e.value)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                entity === e.value
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
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

      {/* View toggle */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
          {VIEW_MODES.map(v => (
            <button key={v.value} onClick={() => setView(v.value)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                view === v.value
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}>
              <span>{v.icon}</span> {v.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
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
        {view === 'card' && <CardView entries={visibleEntries} onDelete={async id => { await deleteEntry(id); refresh() }} onChat={e => setChatTarget({ id: e.id, title: e.title ?? undefined })} />}
        {view === 'list' && <ListView entries={visibleEntries} onDelete={async id => { await deleteEntry(id); refresh() }} />}
        {view === 'insights' && <InsightsView entries={entries} />}
        {view === 'vault' && (
          <VaultView
            entries={vault}
            onDownload={async id => { window.open(await getVaultDownloadUrl(id), '_blank', 'noopener,noreferrer') }}
            onDelete={async id => { await deleteVaultEntry(id); refresh() }}
            onUpload={async fd => { await uploadVaultFile(fd); refresh() }}
          />
        )}
      </div>

      {composerOpen && <Composer onClose={() => setComposerOpen(false)} onCreated={() => { setComposerOpen(false); refresh() }} />}
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
  const [entity, setEntity] = useState<Entity>('personal')
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
        await createEntry({ body, entity, kind })
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
        fd.append('entity', entity)
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

          <div className="mt-3 flex items-center gap-3">
            <select value={kind} onChange={e => setKind(e.target.value as Kind)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900">
              <option value="note">Note</option>
              <option value="idea">Idea</option>
              <option value="doc">Doc</option>
            </select>
            <select value={entity} onChange={e => setEntity(e.target.value as Entity)}
              className="rounded border border-gray-300 px-2 py-1.5 text-sm text-gray-900">
              <option value="personal">Personal</option>
              <option value="tm">TM</option>
              <option value="sf">SF</option>
              <option value="sfe">SFE</option>
            </select>
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

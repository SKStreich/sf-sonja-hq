'use client'
import { useState, useTransition } from 'react'
import { syncNotionPages, deleteDocument } from '@/app/api/documents/actions'

interface Document {
  id: string
  title: string
  source: string
  notion_url: string | null
  content_preview: string | null
  last_synced_at: string | null
  entity_id: string | null
  tags: string[] | null
}

interface Integration {
  status: string
  last_sync_at: string | null
}

interface Props {
  documents: Document[]
  notionIntegration: Integration | null
  notionConfigured: boolean
}

export function DocumentsClient({ documents: initialDocs, notionIntegration, notionConfigured }: Props) {
  const [documents, setDocuments] = useState(initialDocs)
  const [search, setSearch] = useState('')
  const [syncResult, setSyncResult] = useState<{ synced: number; error: string | null } | null>(null)
  const [syncing, startSync] = useTransition()
  const [, startDelete] = useTransition()

  const handleSync = () => {
    setSyncResult(null)
    startSync(async () => {
      const result = await syncNotionPages()
      setSyncResult(result)
      // Reload docs via a page refresh after sync
      if (!result.error) window.location.reload()
    })
  }

  const handleDelete = (id: string) => {
    setDocuments(ds => ds.filter(d => d.id !== id))
    startDelete(async () => { await deleteDocument(id) })
  }

  const filtered = documents.filter(d =>
    !search || d.title.toLowerCase().includes(search.toLowerCase())
  )

  function relativeSync(iso: string | null) {
    if (!iso) return 'Never'
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60_000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  const SOURCE_ICON: Record<string, string> = {
    notion: 'N', upload: '↑', generated: '✦',
  }
  const SOURCE_COLOR: Record<string, string> = {
    notion: 'bg-gray-700 text-gray-300', upload: 'bg-indigo-900/50 text-indigo-300', generated: 'bg-purple-900/50 text-purple-300',
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Document Library</h1>
          <p className="text-sm text-gray-500 mt-0.5">{documents.length} document{documents.length !== 1 ? 's' : ''} synced</p>
        </div>
        <div className="flex items-center gap-3">
          {notionConfigured ? (
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 rounded-lg bg-gray-800 border border-gray-700 px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:border-gray-600 transition-colors disabled:opacity-40"
            >
              <span className={syncing ? 'animate-spin inline-block' : ''}>↻</span>
              {syncing ? 'Syncing…' : 'Sync Notion'}
            </button>
          ) : (
            <span className="text-xs text-gray-600 italic">Add NOTION_API_KEY to enable sync</span>
          )}
        </div>
      </div>

      {/* Notion status bar */}
      {notionConfigured && (
        <div className="flex items-center gap-2 mb-5 rounded-lg border border-gray-800 bg-gray-900/40 px-4 py-2.5">
          <span className={`h-2 w-2 rounded-full shrink-0 ${notionIntegration?.status === 'active' ? 'bg-green-500' : 'bg-gray-600'}`} />
          <span className="text-xs text-gray-400">Notion</span>
          <span className="text-xs text-gray-600 ml-auto">Last synced: {relativeSync(notionIntegration?.last_sync_at ?? null)}</span>
        </div>
      )}

      {/* Sync result banner */}
      {syncResult && (
        <div className={`mb-5 rounded-lg border px-4 py-2.5 text-sm ${syncResult.error ? 'border-red-800 bg-red-950/30 text-red-400' : 'border-green-800 bg-green-950/30 text-green-400'}`}>
          {syncResult.error ? `Sync failed: ${syncResult.error}` : `✓ Synced ${syncResult.synced} pages from Notion`}
        </div>
      )}

      {/* Search */}
      <input
        type="search"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search documents…"
        className="mb-5 w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-gray-600"
      />

      {/* Document list */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-16">
          {notionConfigured ? (
            <>
              <p className="text-sm text-gray-500 mb-3">No documents yet — sync your Notion workspace to get started</p>
              <button onClick={handleSync} disabled={syncing}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
                Sync Now
              </button>
            </>
          ) : (
            <p className="text-sm text-gray-600 italic">Add NOTION_API_KEY to your environment to sync documents</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(doc => (
            <div key={doc.id} className="group flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900/30 px-4 py-3 hover:bg-gray-900/60 transition-colors">
              <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded text-[11px] font-bold ${SOURCE_COLOR[doc.source] ?? SOURCE_COLOR.upload}`}>
                {SOURCE_ICON[doc.source] ?? '?'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {doc.notion_url ? (
                    <a href={doc.notion_url} target="_blank" rel="noopener noreferrer"
                      className="text-sm font-medium text-white hover:text-indigo-400 transition-colors truncate">
                      {doc.title}
                    </a>
                  ) : (
                    <span className="text-sm font-medium text-white truncate">{doc.title}</span>
                  )}
                  {doc.notion_url && (
                    <span className="text-xs text-gray-700 shrink-0">↗</span>
                  )}
                </div>
                {doc.content_preview && (
                  <p className="text-xs text-gray-600 mt-0.5">{doc.content_preview}</p>
                )}
              </div>
              <div className="flex items-center gap-3 shrink-0">
                {doc.last_synced_at && (
                  <span className="text-xs text-gray-700 hidden group-hover:inline">{relativeSync(doc.last_synced_at)}</span>
                )}
                <button
                  onClick={() => handleDelete(doc.id)}
                  className="opacity-0 group-hover:opacity-100 text-gray-700 hover:text-red-400 transition-all text-sm"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

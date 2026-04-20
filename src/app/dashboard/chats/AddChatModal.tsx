'use client'
import { useState, useTransition } from 'react'
import { addChatEntry, extractChatInsights } from '@/app/api/chats/actions'

interface Entity { id: string; name: string; type: string }

interface Props {
  entities: Entity[]
  onClose: () => void
  onAdded: () => void
  anthropicConfigured: boolean
}

const ENTITY_LABELS: Record<string, string> = {
  tm: 'Triplemeter', sf: 'SF Solutions', sfe: 'SF Enterprises', personal: 'Personal',
}

export function AddChatModal({ entities, onClose, onAdded, anthropicConfigured }: Props) {
  const [tab, setTab] = useState<'manual' | 'extract'>(anthropicConfigured ? 'extract' : 'manual')

  // Manual form
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [decisions, setDecisions] = useState('')
  const [entityId, setEntityId] = useState('')
  const [url, setUrl] = useState('')
  const [chatDate, setChatDate] = useState(new Date().toISOString().slice(0, 10))
  const [tags, setTags] = useState('')

  // Extract tab
  const [rawText, setRawText] = useState('')
  const [extracting, startExtract] = useTransition()
  const [extracted, setExtracted] = useState<any>(null)
  const [extractError, setExtractError] = useState('')

  const [saving, startSave] = useTransition()
  const [error, setError] = useState('')

  const handleExtract = () => {
    if (!rawText.trim()) return
    setExtractError('')
    startExtract(async () => {
      try {
        const result = await extractChatInsights(rawText)
        setExtracted(result)
        setTitle(result.title)
        setSummary(result.summary)
        setDecisions(result.key_decisions.join('\n'))
        setTags(result.suggested_tags.join(', '))
        if (result.entity_hint) {
          const match = entities.find(e => e.type === result.entity_hint)
          if (match) setEntityId(match.id)
        }
        setTab('manual')
      } catch (e: any) {
        setExtractError(e.message ?? 'Extraction failed')
      }
    })
  }

  const handleSave = () => {
    if (!title.trim()) { setError('Title is required'); return }
    setError('')
    startSave(async () => {
      try {
        await addChatEntry({
          title: title.trim(),
          summary: summary.trim() || null,
          key_decisions: decisions.split('\n').map(d => d.trim()).filter(Boolean),
          entity_id: entityId || null,
          url: url.trim() || null,
          chat_date: chatDate || null,
          tags: tags.split(',').map(t => t.trim().toLowerCase()).filter(Boolean),
        })
        onAdded()
        onClose()
      } catch (e: any) {
        setError(e.message ?? 'Failed to save')
      }
    })
  }

  const inputCls = 'w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500 transition-colors'
  const labelCls = 'block text-xs font-medium uppercase tracking-wider text-gray-500 mb-1.5'

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/50" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-lg rounded-2xl border border-gray-800 bg-gray-950 shadow-2xl flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 shrink-0">
            <h2 className="text-base font-semibold text-white">Log Chat</h2>
            <button onClick={onClose} className="text-gray-600 hover:text-gray-400 transition-colors text-lg leading-none">✕</button>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-800 px-6 shrink-0">
            {anthropicConfigured && (
              <button onClick={() => setTab('extract')}
                className={`py-2.5 mr-4 text-sm font-medium border-b-2 transition-colors ${tab === 'extract' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-600 hover:text-gray-400'}`}>
                ✦ AI Extract
              </button>
            )}
            <button onClick={() => setTab('manual')}
              className={`py-2.5 mr-4 text-sm font-medium border-b-2 transition-colors ${tab === 'manual' ? 'border-indigo-500 text-white' : 'border-transparent text-gray-600 hover:text-gray-400'}`}>
              Manual
            </button>
          </div>

          <div className="overflow-y-auto flex-1 px-6 py-5">
            {tab === 'extract' && (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Paste Chat Transcript</label>
                  <textarea
                    value={rawText}
                    onChange={e => setRawText(e.target.value)}
                    placeholder="Paste your Claude conversation here — Claude will extract the title, summary, key decisions, and tags automatically."
                    rows={10}
                    className={`${inputCls} resize-none font-mono text-xs`}
                  />
                  <p className="mt-1.5 text-xs text-gray-600">First 8,000 characters will be analyzed.</p>
                </div>
                {extractError && <p className="text-xs text-red-400">{extractError}</p>}
                {extracted && (
                  <p className="text-xs text-green-400">✓ Extracted — review and save in the Manual tab.</p>
                )}
                <button
                  onClick={handleExtract}
                  disabled={!rawText.trim() || extracting}
                  className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                >
                  {extracting ? 'Extracting…' : 'Extract with AI'}
                </button>
              </div>
            )}

            {tab === 'manual' && (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Title *</label>
                  <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What was this chat about?" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Summary</label>
                  <textarea value={summary} onChange={e => setSummary(e.target.value)} placeholder="2-3 sentences on what was discussed and decided." rows={3} className={`${inputCls} resize-none`} />
                </div>
                <div>
                  <label className={labelCls}>Key Decisions / Action Items</label>
                  <textarea
                    value={decisions}
                    onChange={e => setDecisions(e.target.value)}
                    placeholder="One per line — decisions made, things to build, open questions."
                    rows={4}
                    className={`${inputCls} resize-none`}
                  />
                  <p className="mt-1 text-xs text-gray-600">One decision per line.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelCls}>Entity</label>
                    <select value={entityId} onChange={e => setEntityId(e.target.value)} className={inputCls}>
                      <option value="">None</option>
                      {entities.map(e => (
                        <option key={e.id} value={e.id}>{ENTITY_LABELS[e.type] ?? e.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Date</label>
                    <input type="date" value={chatDate} onChange={e => setChatDate(e.target.value)} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Chat URL</label>
                  <input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://claude.ai/chat/…" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Tags</label>
                  <input value={tags} onChange={e => setTags(e.target.value)} placeholder="auth, supabase, sprint-3" className={inputCls} />
                  <p className="mt-1 text-xs text-gray-600">Comma-separated.</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {tab === 'manual' && (
            <div className="px-6 py-4 border-t border-gray-800 shrink-0">
              {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
              <div className="flex gap-3">
                <button onClick={onClose} className="flex-1 rounded-lg border border-gray-700 py-2 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={!title.trim() || saving}
                  className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
                  {saving ? 'Saving…' : 'Save Chat'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}

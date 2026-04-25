'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { globalSearch, type SearchResult, type SearchResultType } from '@/app/api/search/actions'

const TYPE_LABELS: Record<SearchResultType, string> = {
  project: 'Project',
  task: 'Task',
  note: 'Note',
  file: 'File',
}

const TYPE_ICONS: Record<SearchResultType, string> = {
  project: '📋',
  task: '✓',
  note: '📝',
  file: '📎',
}

const TYPE_ORDER: SearchResultType[] = ['project', 'task', 'note', 'file']

export function GlobalSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(o => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery('')
      setResults([])
      setActiveIdx(0)
    }
  }, [open])

  const runSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true)
    const r = await globalSearch(q)
    setResults(r)
    setActiveIdx(0)
    setLoading(false)
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => runSearch(query), 280)
    return () => clearTimeout(timer)
  }, [query, runSearch])

  const navigate = (href: string) => {
    setOpen(false)
    router.push(href)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[activeIdx]) navigate(results[activeIdx].href)
  }

  const grouped = TYPE_ORDER.reduce<Record<SearchResultType, SearchResult[]>>((acc, t) => {
    acc[t] = results.filter(r => r.type === t)
    return acc
  }, { project: [], task: [], note: [], file: [] })

  const flatList = TYPE_ORDER.flatMap(t => grouped[t])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-500 hover:border-gray-300 hover:text-gray-600 transition-colors"
      >
        <span className="text-base leading-none">⌕</span>
        <span className="hidden lg:block">Search</span>
        <kbd className="hidden lg:block rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">⌘K</kbd>
      </button>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Modal */}
      <div className="fixed left-1/2 top-[15%] z-50 w-full max-w-xl -translate-x-1/2 rounded-2xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <span className="text-lg text-gray-400">⌕</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search projects, tasks, notes, files…"
            className="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none"
          />
          {loading && <span className="text-xs text-gray-400 animate-pulse">Searching…</span>}
          <kbd className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">Esc</kbd>
        </div>

        {/* Results */}
        {results.length > 0 && (
          <div className="max-h-96 overflow-y-auto p-2">
            {TYPE_ORDER.map(type => {
              const group = grouped[type]
              if (!group.length) return null
              return (
                <div key={type} className="mb-2">
                  <div className="px-3 py-1 text-xs font-medium uppercase tracking-wider text-gray-400">
                    {TYPE_LABELS[type]}s
                  </div>
                  {group.map(r => {
                    const idx = flatList.indexOf(r)
                    return (
                      <button
                        key={r.id}
                        onClick={() => navigate(r.href)}
                        onMouseEnter={() => setActiveIdx(idx)}
                        className={`w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                          activeIdx === idx ? 'bg-gray-100' : 'hover:bg-gray-50'
                        }`}
                      >
                        <span className="mt-0.5 text-base shrink-0">{TYPE_ICONS[type]}</span>
                        <div className="min-w-0">
                          <p className="text-sm text-gray-900 truncate">{r.title}</p>
                          {r.subtitle && <p className="text-xs text-gray-500 capitalize">{r.subtitle}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {query.trim().length >= 2 && !loading && results.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            No results for &ldquo;{query}&rdquo;
          </div>
        )}

        {query.trim().length < 2 && (
          <div className="px-4 py-6 text-center text-xs text-gray-400">
            Type at least 2 characters to search
          </div>
        )}
      </div>
    </>
  )
}

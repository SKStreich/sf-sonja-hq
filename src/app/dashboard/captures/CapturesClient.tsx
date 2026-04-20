'use client'
import { useState, useTransition } from 'react'
import { markCaptureReviewed, deleteCapture } from './actions'

const TYPE_STYLE: Record<string, string> = {
  idea: 'bg-purple-900/50 text-purple-300',
  task: 'bg-blue-900/50 text-blue-300',
  note: 'bg-gray-800 text-gray-400',
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay === 1) return 'Yesterday'
  return `${diffDay}d ago`
}

interface Capture {
  id: string
  content: string
  type: string | null
  entity_context: string | null
  reviewed: boolean
  created_at: string
}

export function CapturesClient({ initialCaptures }: { initialCaptures: Capture[] }) {
  const [captures, setCaptures] = useState(initialCaptures)
  const [filter, setFilter] = useState<'unreviewed' | 'all'>('unreviewed')
  const [, startTransition] = useTransition()

  const visible = filter === 'unreviewed' ? captures.filter(c => !c.reviewed) : captures

  const handleReview = (id: string) => {
    setCaptures(prev => prev.map(c => c.id === id ? { ...c, reviewed: true } : c))
    startTransition(() => markCaptureReviewed(id))
  }

  const handleDelete = (id: string) => {
    setCaptures(prev => prev.filter(c => c.id !== id))
    startTransition(() => deleteCapture(id))
  }

  return (
    <div>
      {/* Filter pills */}
      <div className="mb-4 flex gap-2">
        {(['unreviewed', 'all'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200'
            }`}
          >
            {f === 'unreviewed' ? 'Unreviewed' : 'All'}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-gray-800 bg-gray-900/30 py-12 text-center">
          <p className="text-sm text-gray-500">
            {filter === 'unreviewed' ? 'Inbox zero 🎉' : 'No captures yet'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map(capture => (
            <li
              key={capture.id}
              className={`rounded-xl border p-4 transition-colors ${
                capture.reviewed
                  ? 'border-gray-800/50 bg-gray-900/20 opacity-60'
                  : 'border-gray-800 bg-gray-900/40'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${
                  TYPE_STYLE[capture.type ?? 'note'] ?? TYPE_STYLE.note
                }`}>
                  {capture.type ?? 'note'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-200">{capture.content}</p>
                  <div className="mt-1 flex items-center gap-2">
                    {capture.entity_context && (
                      <span className="text-xs text-gray-500">{capture.entity_context}</span>
                    )}
                    <span className="text-xs text-gray-600">{relativeTime(capture.created_at)}</span>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  {!capture.reviewed && (
                    <button
                      onClick={() => handleReview(capture.id)}
                      className="rounded px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
                      title="Mark reviewed"
                    >
                      ✓ Done
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(capture.id)}
                    className="rounded px-2 py-1 text-xs text-gray-600 hover:bg-gray-700 hover:text-red-400 transition-colors"
                    title="Delete"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

'use client'
import { useState, useTransition } from 'react'
import { setFocusNote } from '@/app/api/focus/actions'

interface FocusNote { id: string; content: string; created_at: string }
interface FocusBannerProps { focusNote: FocusNote | null; userId: string }

export function FocusBanner({ focusNote, userId }: FocusBannerProps) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(focusNote?.content ?? '')
  const [saved, setSaved] = useState(focusNote?.content ?? '')
  const [isPending, startTransition] = useTransition()

  const handleSave = () => {
    if (!value.trim() || value.trim() === saved) { setEditing(false); return }
    startTransition(async () => {
      await setFocusNote({ content: value.trim(), userId })
      setSaved(value.trim())
      setEditing(false)
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') { setValue(saved); setEditing(false) }
  }

  return (
    <div className="relative rounded-xl border border-indigo-500/30 bg-gradient-to-br from-indigo-950/60 to-gray-900 p-6 shadow-lg">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-lg">🎯</span>
        <span className="text-xs font-semibold uppercase tracking-widest text-indigo-400">Today's Focus</span>
      </div>
      {editing ? (
        <div className="space-y-3">
          <textarea autoFocus value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={handleKeyDown}
            placeholder="What matters most today?" rows={2}
            className="w-full resize-none rounded-lg bg-gray-900/80 px-4 py-3 text-lg text-white placeholder-gray-600 outline-none ring-1 ring-indigo-500/50 focus:ring-indigo-400 transition-all" />
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={isPending}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
              {isPending ? 'Saving…' : 'Set focus'}
            </button>
            <button onClick={() => { setValue(saved); setEditing(false) }}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Cancel</button>
            <span className="ml-auto text-xs text-gray-600">Enter to save · Esc to cancel</span>
          </div>
        </div>
      ) : (
        <button onClick={() => setEditing(true)} className="w-full text-left group">
          {saved
            ? <p className="text-xl font-medium text-white leading-snug group-hover:text-indigo-200 transition-colors">{saved}</p>
            : <p className="text-xl text-gray-600 italic group-hover:text-gray-500 transition-colors">What matters most today? Click to set your focus…</p>
          }
          <span className="mt-2 block text-xs text-gray-600 group-hover:text-gray-500 transition-colors">
            Click to {saved ? 'update' : 'set'} focus
          </span>
        </button>
      )}
    </div>
  )
}

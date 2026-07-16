'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveJournalDay } from '@/app/api/journal/actions'
import { formatJournalDateLabel, nextJournalDate, prevJournalDate } from '@/lib/journal/dates'
import { VoiceDictateButton } from '@/components/shared/VoiceDictateButton'

interface JournalClientProps {
  date: string      // YYYY-MM-DD, validated by the page
  today: string     // today's journal date (America/Chicago)
  initialBody: string
}

type SaveState = 'clean' | 'dirty' | 'saving' | 'saved' | 'error'

const AUTOSAVE_MS = 1200

export function JournalClient({ date, today, initialBody }: JournalClientProps) {
  const router = useRouter()
  const [body, setBody] = useState(initialBody)
  const [saveState, setSaveState] = useState<SaveState>('clean')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestBodyRef = useRef(initialBody)
  const saveSeqRef = useRef(0)

  const isToday = date === today
  const isFuture = date > today

  const doSave = useCallback(async (text: string) => {
    const seq = ++saveSeqRef.current
    setSaveState('saving')
    try {
      await saveJournalDay(date, text)
      // Only the most recent save gets to report status (typing may have
      // queued a newer one while this was in flight).
      if (seq === saveSeqRef.current) {
        setSaveState(latestBodyRef.current === text ? 'saved' : 'dirty')
      }
    } catch {
      if (seq === saveSeqRef.current) setSaveState('error')
    }
  }, [date])

  const handleChange = (text: string) => {
    setBody(text)
    latestBodyRef.current = text
    setSaveState('dirty')
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => doSave(latestBodyRef.current), AUTOSAVE_MS)
  }

  // Flush a pending save on unmount/navigation instead of dropping it.
  useEffect(() => () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      void doSave(latestBodyRef.current)
    }
  }, [doSave])

  const insertAtCursor = (text: string) => {
    const el = textareaRef.current
    const current = latestBodyRef.current
    let next: string
    if (el && document.activeElement === el) {
      const start = el.selectionStart ?? current.length
      const end = el.selectionEnd ?? start
      next = current.slice(0, start) + text + current.slice(end)
    } else {
      // Not focused: append as its own paragraph.
      next = current ? `${current.trimEnd()}\n\n${text}` : text
    }
    handleChange(next)
  }

  const goTo = (d: string) => router.push(`/dashboard/journal/${d}`)

  const savedLabel: Record<SaveState, string> = {
    clean: '',
    dirty: 'Unsaved changes…',
    saving: 'Saving…',
    saved: '✓ Saved',
    error: '⚠ Save failed — still typing is safe, retrying on next change',
  }

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header: date nav */}
      <div className="mb-6">
        <Link href="/dashboard" className="text-xs uppercase tracking-wider text-gray-500 hover:text-gray-700 transition-colors">
          ← Dashboard
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold text-gray-900">
            📓 {formatJournalDateLabel(date)}
            {isToday && <span className="ml-2 align-middle rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600">Today</span>}
          </h1>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => goTo(prevJournalDate(date))}
            title="Previous day"
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ‹ {prevJournalDate(date)}
          </button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={e => { if (e.target.value) goTo(e.target.value) }}
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1 text-sm text-gray-700"
          />
          <button
            onClick={() => goTo(nextJournalDate(date))}
            disabled={nextJournalDate(date) > today}
            title="Next day"
            className="rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {nextJournalDate(date)} ›
          </button>
          {!isToday && (
            <button
              onClick={() => goTo(today)}
              className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              Today
            </button>
          )}
        </div>
      </div>

      {/* Editor */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-4 py-2">
          <VoiceDictateButton onTranscript={t => insertAtCursor(t)} disabled={isFuture} />
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {wordCount > 0 && <span>{wordCount} word{wordCount === 1 ? '' : 's'}</span>}
            <span className={saveState === 'error' ? 'text-red-600' : saveState === 'saved' ? 'text-green-600' : ''}>
              {savedLabel[saveState]}
            </span>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          value={body}
          onChange={e => handleChange(e.target.value)}
          disabled={isFuture}
          placeholder={isToday
            ? 'How was today? Type, or hit Dictate and just talk…'
            : `What happened on ${formatJournalDateLabel(date)}?`}
          className="block w-full resize-y rounded-b-lg border-0 px-4 py-3 text-[15px] leading-7 text-gray-900 placeholder:text-gray-400 focus:ring-0 min-h-[26rem]"
        />
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Markdown welcome. Autosaves as you write. Your journal is only visible to you.
      </p>
    </div>
  )
}

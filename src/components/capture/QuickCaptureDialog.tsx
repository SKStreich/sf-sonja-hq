'use client'
import { useState, useRef, useEffect, useTransition } from 'react'
import { submitCapture } from '@/app/api/capture/actions'

type CaptureType = 'idea' | 'task'

const ENTITY_OPTIONS = [
  { value: '', label: 'No specific context' },
  { value: 'SF Core', label: 'SF Core (ops platform)' },
  { value: 'SF Facilities', label: 'SF Facilities' },
  { value: 'SF Solutions', label: 'SF Solutions' },
  { value: 'Triplemeter', label: 'Triplemeter' },
  { value: 'Back Office', label: 'Back Office Services' },
  { value: 'KRC Analyzer', label: 'KRC Basketball Analyzer' },
  { value: 'Personal', label: 'Personal' },
]

export function QuickCaptureDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [type, setType] = useState<CaptureType>('idea')
  const [content, setContent] = useState('')
  const [entityContext, setEntityContext] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [isPending, startTransition] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) { setTimeout(() => textareaRef.current?.focus(), 50) }
    else { setTimeout(() => { setContent(''); setEntityContext(''); setType('idea'); setSubmitted(false) }, 200) }
  }, [open])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape' && open) onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const handleSubmit = () => {
    if (!content.trim()) return
    startTransition(async () => {
      await submitCapture({ type, content: content.trim(), entity_context: entityContext || null })
      setSubmitted(true)
      setTimeout(() => onClose(), 800)
    })
  }

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true"
        className="fixed left-1/2 top-[20vh] z-50 w-full max-w-lg -translate-x-1/2 rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl ring-1 ring-white/5">
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-white">Quick Capture</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors text-lg leading-none">×</button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex rounded-lg border border-gray-800 bg-gray-950 p-1 gap-1">
            {(['idea', 'task'] as CaptureType[]).map((t) => (
              <button key={t} onClick={() => setType(t)}
                className={`flex-1 rounded-md py-1.5 text-sm font-medium transition-all ${type === t ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500 hover:text-gray-300'}`}>
                {t === 'idea' ? '💡 Idea' : '✅ Task'}
              </button>
            ))}
          </div>
          <textarea ref={textareaRef} value={content} onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); handleSubmit() } }}
            placeholder={type === 'idea' ? 'What\'s the idea? Capture it before it disappears…' : 'What needs to get done?'}
            rows={3}
            className="w-full resize-none rounded-xl bg-gray-950 px-4 py-3 text-sm text-white placeholder-gray-600 outline-none ring-1 ring-gray-700 focus:ring-indigo-500 transition-all" />
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Context (optional)</label>
            <select value={entityContext} onChange={(e) => setEntityContext(e.target.value)}
              className="w-full rounded-lg bg-gray-950 px-3 py-2 text-sm text-gray-300 ring-1 ring-gray-700 focus:ring-indigo-500 outline-none transition-all">
              {ENTITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-gray-600">⌘ + Enter to save</span>
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-300 transition-colors">Cancel</button>
              <button onClick={handleSubmit} disabled={!content.trim() || isPending || submitted}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${submitted ? 'bg-green-600 text-white cursor-default' : 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed'}`}>
                {submitted ? '✓ Saved' : isPending ? 'Saving…' : 'Save capture'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { QuickCaptureDialog } from './QuickCaptureDialog'

export function QuickCaptureButton() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(true) }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-3 py-1.5 text-sm text-gray-300 hover:border-gray-600 hover:text-white transition-all">
        <span>✏️</span>
        <span className="hidden sm:inline">Capture</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-gray-700 bg-gray-800 px-1.5 py-0.5 text-[10px] font-mono text-gray-500">⌘K</kbd>
      </button>
      <QuickCaptureDialog open={open} onClose={() => setOpen(false)} />
    </>
  )
}

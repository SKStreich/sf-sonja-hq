'use client'
import Link from 'next/link'
import { useEffect } from 'react'

export default function SettingsError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => { console.error('[Settings error]', error) }, [error])

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8">
        <Link href="/dashboard" className="text-xs uppercase tracking-wider text-gray-600 hover:text-gray-400 transition-colors">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Settings</h1>
      </div>
      <div className="rounded-xl border border-red-900/40 bg-red-950/20 p-6">
        <p className="text-sm font-medium text-red-400 mb-1">Something went wrong loading Settings.</p>
        <p className="text-xs text-gray-600 mb-4">Your action was saved — this is a display error only.</p>
        <div className="flex gap-3">
          <button
            onClick={reset}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            Reload Settings
          </button>
          <Link href="/dashboard" className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors">
            Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}

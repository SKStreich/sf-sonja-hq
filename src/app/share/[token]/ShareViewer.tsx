'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { setShareConsent, submitForwardRequest, type SharedView } from '@/app/api/knowledge/shares'

function wrapHtml(inner: string): string {
  if (/<html[\s>]/i.test(inner) || /<!doctype/i.test(inner)) return inner
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body { font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111827; padding: 1rem; margin: 0; background: #fff; -webkit-user-select: none; user-select: none; }
  h1, h2, h3 { color: #111827; margin: 1rem 0 0.5rem; }
  h2 { font-size: 1.1rem; padding: 0.4rem 0.6rem; background: #eef2ff; border-radius: 4px; }
  table { border-collapse: collapse; margin: 0.5rem 0 1.5rem; font-size: 12px; }
  td, th { border: 1px solid #d1d5db; padding: 4px 8px; vertical-align: top; white-space: nowrap; }
  tr:nth-child(even) td { background: #f9fafb; }
  td:empty { background: #fafafa; }
  img { max-width: 100%; height: auto; }
  pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  @media print { body { display: none !important; } }
</style></head><body oncontextmenu="return false" oncopy="return false" oncut="return false" ondragstart="return false">${inner}</body></html>`
}

interface Props {
  view: SharedView
  token: string
}

export function ShareViewer({ view, token }: Props) {
  const [consent, setConsent] = useState(view.consent)
  const [savingConsent, startConsent] = useTransition()
  const [forwardOpen, setForwardOpen] = useState(false)

  // Block right-click + Ctrl/Cmd-C / Ctrl-P on the outer chrome (best-effort).
  useEffect(() => {
    const block = (e: Event) => e.preventDefault()
    const blockKeys = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && (k === 'c' || k === 'p' || k === 's' || k === 'u')) {
        e.preventDefault()
      }
    }
    document.addEventListener('contextmenu', block)
    document.addEventListener('copy', block)
    document.addEventListener('cut', block)
    document.addEventListener('keydown', blockKeys)
    return () => {
      document.removeEventListener('contextmenu', block)
      document.removeEventListener('copy', block)
      document.removeEventListener('cut', block)
      document.removeEventListener('keydown', blockKeys)
    }
  }, [])

  const toggleConsent = (next: boolean) => {
    setConsent(next)
    startConsent(async () => {
      try { await setShareConsent(token, next) }
      catch { setConsent(!next) /* revert on failure */ }
    })
  }

  const expires = new Date(view.expiresAt).toLocaleString()
  const watermarkLines = `${view.recipientEmail}  ·  viewed ${new Date().toLocaleString()}`

  return (
    <div className="min-h-screen bg-gray-50 share-viewer">
      <style jsx global>{`
        .share-viewer .protected { user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
        @media print { .share-viewer .protected { display: none !important; } }
      `}</style>

      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-4xl px-6 py-4 flex items-center gap-2">
          <span className="text-xl">🏢</span>
          <span className="font-bold text-gray-900">Sonja HQ</span>
          <span className="ml-auto text-xs text-gray-400">Shared with {view.recipient}</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">{view.title}</h1>

        {/* Document body — wrapped with watermark overlay */}
        <div className="relative protected">
          {/* Watermark — diagonal repeating pattern */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 overflow-hidden rounded-xl"
            style={{
              backgroundImage: `repeating-linear-gradient(-45deg, transparent 0 200px, rgba(99,102,241,0.06) 200px 201px)`,
            }}
          >
            <div className="absolute inset-0 flex items-center justify-center">
              <span
                className="text-indigo-300 text-xs tracking-widest uppercase opacity-50 select-none"
                style={{ transform: 'rotate(-30deg)', whiteSpace: 'pre-wrap' }}
              >
                {watermarkLines}
              </span>
            </div>
          </div>

          {view.kind === 'html' && (
            <iframe
              srcDoc={wrapHtml(view.html)}
              sandbox=""
              className="w-full rounded-xl border border-gray-200 bg-white"
              style={{ minHeight: '70vh' }}
              title="Shared document"
            />
          )}

          {view.kind === 'pdf' && (
            <iframe
              src={view.signedUrl + '#toolbar=0&navpanes=0'}
              className="w-full rounded-xl border border-gray-200 bg-white"
              style={{ minHeight: '80vh' }}
              title="Shared PDF"
            />
          )}

          {view.kind === 'text' && (
            <article className="rounded-xl border border-gray-200 bg-white p-6">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed font-sans">{view.text}</pre>
            </article>
          )}

          {view.kind === 'plain' && (
            <article className="rounded-xl border border-gray-200 bg-white p-6">
              <pre className="whitespace-pre-wrap text-sm text-gray-800 leading-relaxed font-sans">{view.body}</pre>
            </article>
          )}
        </div>

        {/* Footer actions */}
        <div className="mt-6 flex flex-col items-center gap-3 text-xs text-gray-500">
          <p>Read-only shared link · Expires {expires}</p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={consent}
                disabled={savingConsent}
                onChange={e => toggleConsent(e.target.checked)}
              />
              <span>Stay in touch — Sonja can email me about future updates</span>
            </label>

            <button
              onClick={() => setForwardOpen(true)}
              className="rounded border border-indigo-200 bg-indigo-50 px-3 py-1 text-indigo-700 hover:bg-indigo-100"
            >
              Forward this share
            </button>
          </div>
        </div>
      </main>

      {forwardOpen && (
        <ForwardDialog token={token} onClose={() => setForwardOpen(false)} />
      )}
    </div>
  )
}

function ForwardDialog({ token, onClose }: { token: string; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    startBusy(async () => {
      try {
        await submitForwardRequest({
          token,
          newRecipientName: name,
          newRecipientEmail: email,
          reason: reason.trim() || undefined,
        })
        setDone(true)
      } catch (e: any) { setErr(e.message ?? 'Failed') }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Forward this share</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
        </div>

        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-gray-700">
              Thanks — Sonja has been notified. If approved, the new recipient will receive their own personal link by email.
            </p>
            <button onClick={onClose} className="w-full rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-700 hover:bg-gray-200">Close</button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3 text-sm">
            <p className="text-xs text-gray-500">
              Sonja will review your request. We never share documents without owner approval.
            </p>

            {err && <div className="rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}

            <input value={name} onChange={e => setName(e.target.value)} required placeholder="Recipient name"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
            <input value={email} onChange={e => setEmail(e.target.value)} required type="email" placeholder="Recipient email"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Why should they see this? (optional)"
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-gray-900" />
            <button type="submit" disabled={busy}
              className="w-full rounded-md bg-indigo-600 px-3 py-2 font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
              {busy ? 'Submitting…' : 'Send request'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

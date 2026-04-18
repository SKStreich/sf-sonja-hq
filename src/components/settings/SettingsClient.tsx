'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { regenerateCaptureKey } from '@/app/api/captures/actions'

interface Props {
  captureApiKey: string
  appUrl: string
  userEmail: string
}

export function SettingsClient({ captureApiKey: initialKey, appUrl, userEmail }: Props) {
  const [apiKey, setApiKey] = useState(initialKey)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [regenerating, startRegenerate] = useTransition()
  const [confirmRegen, setConfirmRegen] = useState(false)

  const endpoint = `${appUrl}/api/siri`

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const regen = () => {
    if (!confirmRegen) { setConfirmRegen(true); return }
    startRegenerate(async () => {
      const newKey = await regenerateCaptureKey()
      setApiKey(newKey)
      setConfirmRegen(false)
      setRevealed(true)
    })
  }

  const maskedKey = apiKey ? apiKey.slice(0, 8) + '••••••••••••••••••••••••••••' : '—'

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8">
        <Link href="/dashboard" className="text-xs uppercase tracking-wider text-gray-600 hover:text-gray-400 transition-colors">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">Settings</h1>
        <p className="mt-0.5 text-sm text-gray-500">{userEmail}</p>
      </div>

      {/* Siri / External Capture */}
      <section className="rounded-xl border border-gray-800 bg-gray-900/30 p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-1">Siri Shortcuts & External Capture</h2>
        <p className="text-sm text-gray-500 mb-5">
          Use your personal API key to send captures to HQ from anywhere — Siri, iOS Shortcuts, automation tools, or any HTTP client.
        </p>

        {/* API Key */}
        <div className="mb-5">
          <label className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2 block">Your Capture API Key</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-4 py-2.5 font-mono text-sm text-gray-300">
              {revealed ? apiKey : maskedKey}
            </div>
            <button
              onClick={() => setRevealed(r => !r)}
              className="rounded-lg border border-gray-700 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors"
            >
              {revealed ? 'Hide' : 'Show'}
            </button>
            <button
              onClick={() => copy(apiKey)}
              className="rounded-lg border border-gray-700 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-300 hover:border-gray-600 transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {confirmRegen && (
              <span className="text-xs text-yellow-500">This will break existing shortcuts. Confirm?</span>
            )}
            <button
              onClick={regen}
              disabled={regenerating}
              className={`text-xs transition-colors ${confirmRegen ? 'text-red-400 hover:text-red-300' : 'text-gray-700 hover:text-gray-500'}`}
            >
              {regenerating ? 'Regenerating…' : confirmRegen ? 'Yes, regenerate' : 'Regenerate key'}
            </button>
            {confirmRegen && (
              <button onClick={() => setConfirmRegen(false)} className="text-xs text-gray-700 hover:text-gray-500 transition-colors">Cancel</button>
            )}
          </div>
        </div>

        {/* Endpoint */}
        <div className="mb-6">
          <label className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2 block">Capture Endpoint</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-gray-700 bg-gray-950 px-4 py-2.5 font-mono text-xs text-gray-400 break-all">
              {endpoint}
            </div>
            <button
              onClick={() => copy(endpoint)}
              className="rounded-lg border border-gray-700 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Siri Setup Instructions */}
        <div className="rounded-lg border border-gray-800 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">📱 Set Up Siri Shortcut</h3>
          <ol className="space-y-3 text-sm text-gray-400">
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-900/60 text-indigo-300 text-xs flex items-center justify-center font-bold">1</span>
              <span>Open the <strong className="text-gray-300">Shortcuts</strong> app on your iPhone and tap <strong className="text-gray-300">+</strong> to create a new shortcut.</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-900/60 text-indigo-300 text-xs flex items-center justify-center font-bold">2</span>
              <span>Add a <strong className="text-gray-300">Dictate Text</strong> action (or <em>Ask for Input</em> if you prefer to type).</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-900/60 text-indigo-300 text-xs flex items-center justify-center font-bold">3</span>
              <span>Add a <strong className="text-gray-300">Get Contents of URL</strong> action. Set it to:</span>
            </li>
          </ol>
          <div className="mt-3 ml-8 rounded-lg bg-gray-950 border border-gray-700 p-3 font-mono text-xs text-gray-400 space-y-1">
            <div><span className="text-gray-600">URL: </span><span className="text-indigo-300">{endpoint}</span></div>
            <div><span className="text-gray-600">Method: </span><span className="text-green-400">POST</span></div>
            <div><span className="text-gray-600">Headers: </span><span className="text-yellow-400">Authorization: Bearer [your key]</span></div>
            <div><span className="text-gray-600">Body (JSON): </span><span className="text-gray-300">{'{"text": [Dictated Text], "type": "task"}'}</span></div>
          </div>
          <ol className="space-y-3 text-sm text-gray-400 mt-3" start={4}>
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-900/60 text-indigo-300 text-xs flex items-center justify-center font-bold">4</span>
              <span>Name the shortcut <strong className="text-gray-300">&ldquo;Capture to HQ&rdquo;</strong> and add it to Siri — say <em>&ldquo;Hey Siri, Capture to HQ&rdquo;</em>.</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-900/60 text-indigo-300 text-xs flex items-center justify-center font-bold">5</span>
              <span>Your capture will appear in the HQ dashboard instantly. Set <code className="text-indigo-300">type</code> to <code className="text-indigo-300">&ldquo;idea&rdquo;</code> for ideas or <code className="text-indigo-300">&ldquo;task&rdquo;</code> for tasks.</span>
            </li>
          </ol>
        </div>

        {/* Quick test */}
        <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950/50 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Test with curl</h3>
          <pre className="text-xs text-gray-500 whitespace-pre-wrap break-all font-mono leading-relaxed">
{`curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${revealed ? apiKey : '<your-api-key>'}" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Test capture from terminal","type":"task"}'`}
          </pre>
        </div>
      </section>
    </div>
  )
}

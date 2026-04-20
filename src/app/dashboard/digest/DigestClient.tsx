'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { getDailyDigest, askAnything } from '@/app/api/digest/actions'
import type { InsightData, DailyDigest } from '@/app/api/digest/actions'

interface Props {
  insights: InsightData
  anthropicConfigured: boolean
}

export function DigestClient({ insights, anthropicConfigured }: Props) {
  const [digest, setDigest] = useState<DailyDigest | null>(null)
  const [digestError, setDigestError] = useState('')
  const [generating, startGenerate] = useTransition()

  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [answerError, setAnswerError] = useState('')
  const [asking, startAsk] = useTransition()

  const handleGenerateDigest = () => {
    setDigestError('')
    startGenerate(async () => {
      try {
        const result = await getDailyDigest()
        setDigest(result)
      } catch (e: any) {
        setDigestError(e.message ?? 'Failed to generate digest')
      }
    })
  }

  const handleAsk = () => {
    if (!question.trim()) return
    setAnswerError('')
    setAnswer('')
    startAsk(async () => {
      try {
        const result = await askAnything(question)
        setAnswer(result)
      } catch (e: any) {
        setAnswerError(e.message ?? 'Failed to get answer')
      }
    })
  }

  const hasIssues = insights.overdueTaskCount > 0 || insights.stalledProjects.length > 0 || insights.unreviewedCaptureCount > 0

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">AI Digest</h1>
        <p className="mt-1 text-sm text-gray-500">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </p>
      </div>

      {/* Insight Cards */}
      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Link
          href="/dashboard/tasks"
          className={`rounded-xl border p-4 transition-colors hover:bg-gray-900/60 ${
            insights.overdueTaskCount > 0
              ? 'border-red-900/60 bg-red-950/20 hover:border-red-800'
              : 'border-gray-800 bg-gray-900/30 hover:border-gray-700'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Overdue Tasks</p>
          <p className={`mt-1 text-3xl font-bold ${insights.overdueTaskCount > 0 ? 'text-red-400' : 'text-white'}`}>
            {insights.overdueTaskCount}
          </p>
          {insights.overdueTaskCount > 0 && (
            <p className="mt-1 text-xs text-red-500">Needs attention →</p>
          )}
        </Link>

        <div className={`rounded-xl border p-4 ${
          insights.stalledProjects.length > 0
            ? 'border-orange-900/60 bg-orange-950/20'
            : 'border-gray-800 bg-gray-900/30'
        }`}>
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Stalled Projects</p>
          <p className={`mt-1 text-3xl font-bold ${insights.stalledProjects.length > 0 ? 'text-orange-400' : 'text-white'}`}>
            {insights.stalledProjects.length}
          </p>
          {insights.stalledProjects.length > 0 && (
            <p className="mt-1 text-xs text-orange-500">No next action set</p>
          )}
        </div>

        <Link
          href="/dashboard/captures"
          className={`rounded-xl border p-4 transition-colors hover:bg-gray-900/60 ${
            insights.unreviewedCaptureCount > 0
              ? 'border-yellow-900/60 bg-yellow-950/20 hover:border-yellow-800'
              : 'border-gray-800 bg-gray-900/30 hover:border-gray-700'
          }`}
        >
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500">Unreviewed Captures</p>
          <p className={`mt-1 text-3xl font-bold ${insights.unreviewedCaptureCount > 0 ? 'text-yellow-400' : 'text-white'}`}>
            {insights.unreviewedCaptureCount}
          </p>
          {insights.unreviewedCaptureCount > 0 && (
            <p className="mt-1 text-xs text-yellow-600">In inbox →</p>
          )}
        </Link>
      </div>

      {/* Stalled project list */}
      {insights.stalledProjects.length > 0 && (
        <div className="mb-8 rounded-xl border border-orange-900/40 bg-gray-900/30 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-3">Projects Without a Next Action</p>
          <ul className="space-y-1.5">
            {insights.stalledProjects.map(p => (
              <li key={p.id} className="flex items-center gap-2 text-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-500 shrink-0" />
                <Link href={`/dashboard/projects/${p.id}`} className="text-gray-300 hover:text-white transition-colors">
                  {p.name}
                </Link>
                {p.entity_name && (
                  <span className="text-xs text-gray-600">{p.entity_name}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!anthropicConfigured && (
        <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900/30 p-5 text-center">
          <p className="text-sm text-gray-500">
            Add <code className="text-gray-400 bg-gray-800 px-1.5 py-0.5 rounded text-xs">ANTHROPIC_API_KEY</code> to your environment to unlock AI features.
          </p>
        </div>
      )}

      {/* Daily Brief */}
      {anthropicConfigured && (
        <div className="mb-8 rounded-xl border border-gray-800 bg-gray-900/30 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Today's Brief</h2>
            <button
              onClick={handleGenerateDigest}
              disabled={generating}
              className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
            >
              {generating ? (
                <>
                  <span className="animate-pulse">✦</span> Generating…
                </>
              ) : (
                <>✦ {digest ? 'Regenerate' : 'Generate Brief'}</>
              )}
            </button>
          </div>

          {digestError && <p className="text-xs text-red-400 mb-3">{digestError}</p>}

          {!digest && !generating && (
            <p className="text-sm text-gray-600 py-4 text-center">
              {hasIssues
                ? 'Generate your brief to get AI-powered priorities and recommendations.'
                : 'Everything looks clear. Generate a brief to confirm.'}
            </p>
          )}

          {generating && (
            <div className="py-6 text-center">
              <p className="text-sm text-gray-500 animate-pulse">Reading your workspace…</p>
            </div>
          )}

          {digest && !generating && (
            <div className="space-y-4">
              <p className="text-sm text-gray-300 leading-relaxed">{digest.brief}</p>

              {digest.top_priorities.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-600 mb-2">Top Priorities</p>
                  <ul className="space-y-1.5">
                    {digest.top_priorities.map((p, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                        {p}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {digest.watch_items.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-gray-600 mb-2">Watch List</p>
                  <ul className="space-y-1.5">
                    {digest.watch_items.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-400">
                        <span className="mt-0.5 text-yellow-600 shrink-0">⚠</span>
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {digest.recommendation && (
                <div className="rounded-lg border border-indigo-900/50 bg-indigo-950/30 px-4 py-3">
                  <p className="text-xs font-medium uppercase tracking-wider text-indigo-500 mb-1">Start Here</p>
                  <p className="text-sm text-indigo-200">{digest.recommendation}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Ask Anything */}
      {anthropicConfigured && (
        <div className="rounded-xl border border-gray-800 bg-gray-900/30 p-5">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Ask Anything</h2>

          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !asking) handleAsk() }}
              placeholder="What should I focus on this week? Which projects are at risk?"
              className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-500 transition-colors"
            />
            <button
              onClick={handleAsk}
              disabled={!question.trim() || asking}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors shrink-0"
            >
              {asking ? '…' : 'Ask'}
            </button>
          </div>

          {answerError && <p className="mt-3 text-xs text-red-400">{answerError}</p>}

          {asking && (
            <p className="mt-4 text-sm text-gray-500 animate-pulse">Thinking…</p>
          )}

          {answer && !asking && (
            <div className="mt-4 rounded-lg border border-gray-800 bg-gray-950/60 p-4">
              <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{answer}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

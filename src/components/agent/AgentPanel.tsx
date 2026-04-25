'use client'
import { useState, useTransition, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { sendAgentMessage } from '@/app/api/agent/actions'
import type { AgentMessage } from '@/app/api/agent/actions'

interface Props {
  open: boolean
  onClose: () => void
  starter?: string | null
  onConsumedStarter?: () => void
}

const SUGGESTED = [
  'What should I focus on today?',
  'Show me stalled projects',
  'What tasks are overdue?',
  'Take me to captures inbox',
]

export function AgentPanel({ open, onClose, starter, onConsumedStarter }: Props) {
  const router = useRouter()
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [pending, startSend] = useTransition()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Auto-send starter message when panel opens with one (e.g. "Discuss this entry").
  useEffect(() => {
    if (open && starter) {
      send(starter)
      onConsumedStarter?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, starter])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, pending])

  const send = (text: string) => {
    const msg = text.trim()
    if (!msg || pending) return
    setInput('')
    const next: AgentMessage[] = [...messages, { role: 'user', content: msg }]
    setMessages(next)
    startSend(async () => {
      try {
        const res = await sendAgentMessage(messages, msg)
        setMessages(prev => [...prev, { role: 'assistant', content: res.content }])
        if (res.navigateTo) {
          router.push(res.navigateTo)
        }
      } catch (e: any) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${e.message ?? 'Something went wrong'}` }])
      }
    })
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send(input)
    }
  }

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={`fixed right-0 top-16 bottom-0 z-50 flex w-full max-w-sm flex-col border-l border-gray-200 bg-white shadow-xl transition-transform duration-200 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-indigo-600">✦</span>
            <h2 className="text-sm font-semibold text-gray-900">HQ Agent</h2>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <button
                onClick={() => setMessages([])}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Clear
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 leading-relaxed">
                Ask me anything about your workspace — find tasks and projects, take quick actions, or navigate anywhere.
              </p>
              <div className="space-y-2">
                {SUGGESTED.map(s => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs text-gray-600 hover:border-gray-300 hover:text-gray-900 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 border border-gray-200 text-gray-800'
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}

          {pending && (
            <div className="flex justify-start">
              <div className="rounded-xl border border-gray-200 bg-gray-100 px-3 py-2">
                <span className="text-xs text-indigo-500 animate-pulse">✦ thinking…</span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="border-t border-gray-200 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask anything…"
              disabled={pending}
              className="flex-1 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 transition-colors disabled:opacity-50"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || pending}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors shrink-0"
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

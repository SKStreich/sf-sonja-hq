'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import {
  getOrCreateChat, listChatMessages, sendChatMessage,
  type ChatMessage,
} from '@/app/api/knowledge/chat'

interface Props {
  sourceEntryId: string | null
  sourceTitle?: string
  onClose: () => void
}

export function ChatDrawer({ sourceEntryId, sourceTitle, onClose }: Props) {
  const [chatId, setChatId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sending, startSend] = useTransition()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    ;(async () => {
      try {
        const { chatId: cid } = await getOrCreateChat(sourceEntryId)
        if (cancelled) return
        setChatId(cid)
        const msgs = await listChatMessages(cid)
        if (cancelled) return
        setMessages(msgs)
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Failed to open chat')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [sourceEntryId])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const handleSend = () => {
    const text = input.trim()
    if (!text || !chatId || sending) return
    setInput('')
    setMessages(prev => [...prev, {
      id: `tmp-${Date.now()}`, role: 'user', content: text, created_at: new Date().toISOString(),
    }])
    startSend(async () => {
      try {
        const updated = await sendChatMessage(chatId, text)
        setMessages(updated)
      } catch (e: any) {
        setError(e.message ?? 'Failed to send')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col bg-white shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              {sourceTitle ? `Chat — ${sourceTitle}` : 'Chat'}
            </h2>
            <p className="text-[11px] text-gray-500">
              Claude sees this entry and recent standard knowledge. Vault is excluded.
            </p>
          </div>
          <button onClick={onClose} className="text-xl text-gray-400 hover:text-gray-600">×</button>
        </header>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {loading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : error ? (
            <p className="text-xs text-red-600">{error}</p>
          ) : messages.length === 0 ? (
            <p className="text-xs text-gray-400">
              Start a conversation — ask Claude to poke holes, suggest next steps, or connect this to other ideas.
            </p>
          ) : (
            messages.map(m => <Bubble key={m.id} msg={m} />)
          )}
          {sending && (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">Claude is thinking…</div>
          )}
        </div>

        <div className="border-t border-gray-200 px-5 py-3">
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() }
              }}
              placeholder="Message Claude… (Enter to send, Shift+Enter newline)"
              rows={2}
              disabled={loading || sending}
              className="flex-1 resize-none rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-indigo-400 disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!input.trim() || loading || sending || !chatId}
              className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function Bubble({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
        isUser ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-900'
      }`}>
        {msg.content}
      </div>
    </div>
  )
}

'use client'
import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { saveChatToWorkspace } from '@/app/api/agent/save-chat'
import { defaultChatTitle, type AgentMessageLike } from '@/lib/agent/chat-to-markdown'

interface Props {
  open: boolean
  onClose: () => void
  messages: AgentMessageLike[]
}

const ENTITY_OPTIONS: Array<{ value: 'tm' | 'sf' | 'sfe' | 'sfc' | 'personal'; label: string }> = [
  { value: 'personal', label: 'Personal' },
  { value: 'sfe',      label: 'SF Enterprises' },
  { value: 'sf',       label: 'SF Solutions' },
  { value: 'sfc',      label: 'SF Construction' },
  { value: 'tm',       label: 'Triplemeter' },
]

export function SaveChatModal({ open, onClose, messages }: Props) {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [entity, setEntity] = useState<typeof ENTITY_OPTIONS[number]['value']>('personal')
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')

  // Pre-fill the title from the first user message whenever the modal opens.
  useEffect(() => {
    if (open) {
      setTitle(defaultChatTitle(messages))
      setEntity('personal')
      setErr('')
    }
  }, [open, messages])

  if (!open) return null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    startBusy(async () => {
      try {
        const { id } = await saveChatToWorkspace(messages, { title, entity })
        onClose()
        router.push(`/dashboard/knowledge/${id}`)
      } catch (e: any) {
        setErr(e?.message ?? 'Failed to save')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md rounded-lg border border-gray-200 bg-white p-5 shadow-xl"
      >
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Save chat to workspace</h3>
        <p className="mb-3 text-xs text-gray-500">
          Captures this conversation ({messages.length} message{messages.length === 1 ? '' : 's'}) as
          a workspace page tagged <code className="rounded bg-gray-100 px-1 py-0.5">hq-chat</code>.
        </p>
        <label className="mb-2 block text-xs font-medium text-gray-700">
          Title
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
            autoFocus
          />
        </label>
        <label className="mb-3 block text-xs font-medium text-gray-700">
          Entity
          <select
            value={entity}
            onChange={e => setEntity(e.target.value as typeof entity)}
            className="mt-1 w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900"
          >
            {ENTITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        {err && <div className="mb-3 rounded bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={busy}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
            {busy ? 'Saving…' : 'Save to workspace'}
          </button>
        </div>
      </form>
    </div>
  )
}

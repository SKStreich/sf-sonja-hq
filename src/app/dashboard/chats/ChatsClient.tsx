'use client'
import { useState, useTransition } from 'react'
import { deleteChatEntry } from '@/app/api/chats/actions'
import { AddChatModal } from './AddChatModal'

interface Chat {
  id: string
  title: string
  summary: string | null
  key_decisions: string[]
  entity_id: string | null
  url: string | null
  chat_date: string | null
  tags: string[]
  indexed_at: string
}

interface Entity { id: string; name: string; type: string }

interface Props {
  chats: Chat[]
  entities: Entity[]
  anthropicConfigured: boolean
}

const ENTITY_LABELS: Record<string, string> = {
  tm: 'Triplemeter', sf: 'SF Solutions', sfe: 'SF Enterprises', personal: 'Personal',
}
const ENTITY_COLORS: Record<string, string> = {
  tm: 'text-blue-400', sf: 'text-indigo-400', sfe: 'text-purple-400', personal: 'text-green-400',
}

export function ChatsClient({ chats: initialChats, entities, anthropicConfigured }: Props) {
  const [chats, setChats] = useState(initialChats)
  const [search, setSearch] = useState('')
  const [filterEntity, setFilterEntity] = useState<string>('all')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [, startDelete] = useTransition()

  const handleDelete = (id: string) => {
    setChats(cs => cs.filter(c => c.id !== id))
    startDelete(async () => { await deleteChatEntry(id) })
  }

  const filtered = chats.filter(c => {
    if (filterEntity !== 'all') {
      const entity = entities.find(e => e.id === c.entity_id)
      if (!entity || entity.type !== filterEntity) return false
    }
    if (search) {
      const q = search.toLowerCase()
      return (
        c.title.toLowerCase().includes(q) ||
        (c.summary ?? '').toLowerCase().includes(q) ||
        c.key_decisions.some(d => d.toLowerCase().includes(q)) ||
        c.tags.some(t => t.toLowerCase().includes(q))
      )
    }
    return true
  })

  function formatDate(iso: string | null) {
    if (!iso) return ''
    return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const entityTypes = Array.from(new Set(entities.map(e => e.type)))

  return (
    <>
      <div className="mx-auto max-w-4xl px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Chat History</h1>
            <p className="text-sm text-gray-500 mt-0.5">{chats.length} conversation{chats.length !== 1 ? 's' : ''} indexed</p>
          </div>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
          >
            + Log Chat
          </button>
        </div>

        {/* Search + entity filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-6">
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search title, summary, decisions, tags…"
            className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-gray-600"
          />
          <div className="flex items-center gap-1 rounded-lg border border-gray-800 bg-gray-900 p-1">
            <button
              onClick={() => setFilterEntity('all')}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterEntity === 'all' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
            >
              All
            </button>
            {entityTypes.map(type => (
              <button key={type}
                onClick={() => setFilterEntity(filterEntity === type ? 'all' : type)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${filterEntity === type ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              >
                {ENTITY_LABELS[type] ?? type}
              </button>
            ))}
          </div>
        </div>

        {/* Chat list */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-800 py-16">
            <p className="text-sm text-gray-500 mb-3">
              {chats.length === 0 ? 'No chats logged yet' : 'No results match your search'}
            </p>
            {chats.length === 0 && (
              <button onClick={() => setAddOpen(true)}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
                Log your first chat
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(chat => {
              const entity = entities.find(e => e.id === chat.entity_id)
              const isExpanded = expanded === chat.id
              return (
                <div key={chat.id} className="rounded-xl border border-gray-800 bg-gray-900/30 overflow-hidden">
                  {/* Chat header row */}
                  <div
                    className="flex items-start gap-3 px-5 py-4 cursor-pointer hover:bg-gray-900/60 transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : chat.id)}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {entity && (
                          <span className={`text-xs font-medium ${ENTITY_COLORS[entity.type] ?? 'text-gray-500'}`}>
                            {ENTITY_LABELS[entity.type] ?? entity.name}
                          </span>
                        )}
                        {chat.chat_date && (
                          <span className="text-xs text-gray-600">{formatDate(chat.chat_date)}</span>
                        )}
                        {chat.tags.map(tag => (
                          <span key={tag} className="rounded-full bg-gray-800 px-2 py-0.5 text-[11px] text-gray-500">{tag}</span>
                        ))}
                      </div>
                      <h3 className="text-sm font-semibold text-white leading-snug">{chat.title}</h3>
                      {chat.summary && !isExpanded && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{chat.summary}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {chat.url && (
                        <a href={chat.url} target="_blank" rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-xs text-indigo-500 hover:text-indigo-400 transition-colors">
                          ↗
                        </a>
                      )}
                      <span className="text-xs text-gray-700">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-5 pb-5 border-t border-gray-800/60 pt-4 space-y-4">
                      {chat.summary && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-gray-600 mb-1.5">Summary</p>
                          <p className="text-sm text-gray-300 leading-relaxed">{chat.summary}</p>
                        </div>
                      )}
                      {chat.key_decisions.length > 0 && (
                        <div>
                          <p className="text-xs font-medium uppercase tracking-wider text-gray-600 mb-2">Key Decisions & Actions</p>
                          <ul className="space-y-1.5">
                            {chat.key_decisions.map((d, i) => (
                              <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                                <span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500 shrink-0" />
                                {d}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-xs text-gray-700">Indexed {formatDate(chat.indexed_at.slice(0, 10))}</span>
                        <button
                          onClick={() => handleDelete(chat.id)}
                          className="text-xs text-gray-700 hover:text-red-400 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {addOpen && (
        <AddChatModal
          entities={entities}
          anthropicConfigured={anthropicConfigured}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false)
            window.location.reload()
          }}
        />
      )}
    </>
  )
}

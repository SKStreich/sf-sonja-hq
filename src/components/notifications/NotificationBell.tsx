'use client'
import { useState, useTransition } from 'react'
import { markNotificationRead, markAllNotificationsRead } from '@/app/api/members/actions'

interface Notification {
  id: string
  type: string
  entity_type: string
  entity_id: string
  title: string
  message: string | null
  read: boolean
  created_at: string
}

export function NotificationBell({ initialNotifications }: { initialNotifications: Notification[] }) {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  const [, startTransition] = useTransition()

  const unread = notifications.filter(n => !n.read).length

  const handleRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    startTransition(() => markNotificationRead(id))
  }

  const handleReadAll = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    startTransition(() => markAllNotificationsRead())
  }

  const TYPE_ICON: Record<string, string> = {
    assignment: '👤', update: '📝', due_date: '📅', mention: '@', invite: '✉', comment: '💬',
  }

  function relativeTime(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const m = Math.floor(diff / 60_000)
    if (m < 1) return 'Just now'
    if (m < 60) return `${m}m ago`
    const h = Math.floor(m / 60)
    if (h < 24) return `${h}h ago`
    return `${Math.floor(h / 24)}d ago`
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="relative flex items-center justify-center rounded-md px-2 py-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
        aria-label="Notifications"
      >
        <span className="text-base">🔔</span>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">Notifications</span>
              {unread > 0 && (
                <button onClick={handleReadAll} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
                  Mark all read
                </button>
              )}
            </div>

            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No notifications</div>
            ) : (
              <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
                {notifications.map(n => (
                  <li
                    key={n.id}
                    onClick={() => handleRead(n.id)}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-gray-50 ${n.read ? 'opacity-50' : ''}`}
                  >
                    <span className="mt-0.5 text-base shrink-0">{TYPE_ICON[n.type] ?? '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 leading-snug">{n.title}</p>
                      {n.message && <p className="text-xs text-gray-500 truncate mt-0.5">{n.message}</p>}
                      <p className="text-xs text-gray-400 mt-1">{relativeTime(n.created_at)}</p>
                    </div>
                    {!n.read && <span className="mt-1.5 h-2 w-2 rounded-full bg-indigo-500 shrink-0" />}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}

'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import { CaptureModal } from '@/components/capture/CaptureModal'
import { NotificationBell } from '@/components/notifications/NotificationBell'
import type { Database } from '@/types/supabase'
import type { User } from '@supabase/supabase-js'

type Entity = Database['public']['Tables']['entities']['Row']
type UserProfile = Database['public']['Tables']['user_profiles']['Row']

interface DashboardNavProps {
  user: User
  profile: (UserProfile & { orgs: Database['public']['Tables']['orgs']['Row'] | null }) | null
  entities: Entity[]
  notifications: any[]
}

function useDropdown() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])
  return { open, setOpen, ref }
}

export function DashboardNav({ user, profile, entities, notifications }: DashboardNavProps) {
  const router = useRouter()
  const supabase = createClient()
  const [captureOpen, setCaptureOpen] = useState(false)
  const exportDropdown = useDropdown()
  const profileDropdown = useDropdown()

  const handleSignOut = async () => {
    profileDropdown.setOpen(false)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Account'

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-16 items-center gap-4">

            {/* Left: brand + nav links */}
            <div className="flex items-center gap-4 shrink-0">
              <Link href="/dashboard" className="flex items-center gap-2">
                <span className="text-xl">🏢</span>
                <span className="font-bold text-white hidden sm:block">Sonja HQ</span>
              </Link>
              <div className="hidden md:flex items-center gap-1">
                <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors">
                  Dashboard
                </Link>
                <Link href="/dashboard/projects" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors">
                  Projects
                </Link>
                <Link href="/dashboard/tasks" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors">
                  Tasks
                </Link>
                <Link href="/dashboard/documents" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors">
                  Docs
                </Link>
                <Link href="/dashboard/chats" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors">
                  Chats
                </Link>
                <Link href="/dashboard/digest" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors">
                  Ideas
                </Link>
              </div>
            </div>

            {/* Center: search */}
            <div className="flex-1 flex justify-center">
              <GlobalSearch />
            </div>

            {/* Right: export, capture, profile */}
            <div className="flex items-center gap-2 shrink-0">

              {/* Export dropdown */}
              <div className="relative" ref={exportDropdown.ref}>
                <button
                  onClick={() => exportDropdown.setOpen(o => !o)}
                  className="flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors"
                >
                  <span className="hidden sm:block">Export</span>
                  <span className="text-xs text-gray-600">▾</span>
                </button>
                {exportDropdown.open && (
                  <div className="absolute right-0 top-10 z-50 w-52 rounded-lg border border-gray-700 bg-gray-900 py-1.5 shadow-xl">
                    <div className="px-3 pb-1 pt-0.5 text-xs font-medium uppercase tracking-wider text-gray-600">Tasks</div>
                    <a
                      href="/api/tasks/export"
                      onClick={() => exportDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                    >
                      <span className="text-xs">⬇</span> Export Tasks CSV
                    </a>
                    <a
                      href="/dashboard/tasks/print"
                      target="_blank"
                      onClick={() => exportDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                    >
                      <span className="text-xs">🖨</span> Print Tasks
                    </a>
                    <div className="my-1 border-t border-gray-800" />
                    <div className="px-3 pb-1 pt-0.5 text-xs font-medium uppercase tracking-wider text-gray-600">Projects</div>
                    <a
                      href="/api/projects/export"
                      onClick={() => exportDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                    >
                      <span className="text-xs">⬇</span> Export Projects CSV
                    </a>
                    <a
                      href="/dashboard/projects/print"
                      target="_blank"
                      onClick={() => exportDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors"
                    >
                      <span className="text-xs">🖨</span> Print All Projects
                    </a>
                  </div>
                )}
              </div>

              {/* Notifications */}
              <NotificationBell initialNotifications={notifications} />

              {/* Add Idea */}
              <button
                onClick={() => setCaptureOpen(true)}
                title="Add Idea"
                className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                <span className="text-base leading-none">💡</span>
                <span className="hidden sm:block">Add Idea</span>
              </button>

              {/* Profile dropdown */}
              <div className="relative border-l border-gray-800 pl-2" ref={profileDropdown.ref}>
                <button
                  onClick={() => profileDropdown.setOpen(o => !o)}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors"
                >
                  <span className="hidden sm:block max-w-[120px] truncate">{displayName}</span>
                  <span className="text-xs text-gray-600">▾</span>
                </button>
                {profileDropdown.open && (
                  <div className="absolute right-0 top-10 z-50 w-48 rounded-lg border border-gray-700 bg-gray-900 py-1.5 shadow-xl">
                    <Link href="/dashboard/all-files" onClick={() => profileDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors">
                      <span className="text-xs">📁</span> Files
                    </Link>
                    <Link href="/dashboard/all-logs" onClick={() => profileDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors">
                      <span className="text-xs">📋</span> Notes
                    </Link>
                    <Link href="/dashboard/cost" onClick={() => profileDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors">
                      <span className="text-xs">💰</span> Cost & Usage
                    </Link>
                    <Link href="/dashboard/integrations" onClick={() => profileDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors">
                      <span className="text-xs">🔌</span> Integrations
                    </Link>
                    <div className="my-1 border-t border-gray-800" />
                    <Link href="/dashboard/settings" onClick={() => profileDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-800 hover:text-gray-200 transition-colors">
                      <span className="text-xs">⚙️</span> Settings
                    </Link>
                    <div className="my-1 border-t border-gray-800" />
                    <button onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors">
                      <span className="text-xs">→</span> Sign Out
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </nav>

      <CaptureModal open={captureOpen} onClose={() => setCaptureOpen(false)} />
    </>
  )
}

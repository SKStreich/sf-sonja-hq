'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GlobalSearch } from '@/components/search/GlobalSearch'
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
  const profileDropdown = useDropdown()

  const handleSignOut = async () => {
    profileDropdown.setOpen(false)
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const displayName = profile?.full_name ?? user.email?.split('@')[0] ?? 'Account'
  const isAdmin = profile?.role === 'owner' || profile?.role === 'admin'

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-40 border-b border-gray-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4">
          <div className="flex h-16 items-center gap-4">

            {/* Left: brand + nav links */}
            <div className="flex items-center gap-4 shrink-0">
              <Link href="/dashboard" className="flex items-center gap-2">
                <span className="text-xl">🏢</span>
                <span className="font-bold text-gray-900 hidden sm:block">Sonja HQ</span>
              </Link>
              <div className="hidden md:flex items-center gap-1">
                <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                  Dashboard
                </Link>
                <Link href="/dashboard/knowledge" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                  Knowledge
                </Link>
                <Link href="/dashboard/projects" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                  Projects
                </Link>
                <Link href="/dashboard/tasks" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                  Tasks
                </Link>
                <Link href="/dashboard/contacts" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                  Contacts
                </Link>
              </div>
            </div>

            {/* Center: search */}
            <div className="flex-1 flex justify-center">
              <GlobalSearch />
            </div>

            {/* Right: notifications, capture, profile */}
            <div className="flex items-center gap-2 shrink-0">

              {/* Notifications */}
              <NotificationBell initialNotifications={notifications} />

              {/* Add to Knowledge */}
              <Link
                href="/dashboard/knowledge"
                title="Add to Knowledge"
                className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
              >
                <span className="text-base leading-none">💡</span>
                <span className="hidden sm:block">Add Idea</span>
              </Link>

              {/* Profile dropdown */}
              <div className="relative border-l border-gray-200 pl-2" ref={profileDropdown.ref}>
                <button
                  onClick={() => profileDropdown.setOpen(o => !o)}
                  className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                >
                  <span className="hidden sm:block max-w-[120px] truncate">{displayName}</span>
                  <span className="text-xs text-gray-400">▾</span>
                </button>
                {profileDropdown.open && (
                  <div className="absolute right-0 top-10 z-50 w-48 rounded-lg border border-gray-200 bg-white py-1.5 shadow-lg">
                    <Link href="/dashboard/profile" onClick={() => profileDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                      <span className="text-xs">👤</span> My Profile
                    </Link>
                    <Link href="/dashboard/all-files" onClick={() => profileDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                      <span className="text-xs">📁</span> Files
                    </Link>
                    <Link href="/dashboard/all-logs" onClick={() => profileDropdown.setOpen(false)}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                      <span className="text-xs">📋</span> Notes
                    </Link>
                    {isAdmin && (
                      <>
                        <Link href="/dashboard/cost" onClick={() => profileDropdown.setOpen(false)}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                          <span className="text-xs">💰</span> Cost & Usage
                        </Link>
                        <Link href="/dashboard/integrations" onClick={() => profileDropdown.setOpen(false)}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                          <span className="text-xs">🔌</span> Integrations
                        </Link>
                        <div className="my-1 border-t border-gray-100" />
                        <Link href="/dashboard/settings" onClick={() => profileDropdown.setOpen(false)}
                          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                          <span className="text-xs">⚙️</span> Settings
                        </Link>
                      </>
                    )}
                    <div className="my-1 border-t border-gray-100" />
                    <button onClick={handleSignOut}
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors">
                      <span className="text-xs">→</span> Sign Out
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      </nav>
    </>
  )
}

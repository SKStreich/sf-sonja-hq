'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { GlobalSearch } from '@/components/search/GlobalSearch'
import type { Database } from '@/types/supabase'
import type { User } from '@supabase/supabase-js'

type Entity = Database['public']['Tables']['entities']['Row']
type UserProfile = Database['public']['Tables']['user_profiles']['Row']

interface DashboardNavProps {
  user: User
  profile: (UserProfile & { orgs: Database['public']['Tables']['orgs']['Row'] | null }) | null
  entities: Entity[]
}

export function DashboardNav({ user, profile, entities }: DashboardNavProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
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
            </div>
          </div>

          {/* Center: search */}
          <div className="flex-1 flex justify-center">
            <GlobalSearch />
          </div>

          {/* Right: capture, deep-dive links, user */}
          <div className="flex items-center gap-3 shrink-0">
            <button className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:block">Capture</span>
            </button>

            {/* Deep-dive links — subtle, near username */}
            <div className="hidden lg:flex items-center gap-2 text-xs text-gray-600 border-l border-gray-800 pl-3">
              <Link href="/dashboard/tasks" className="hover:text-gray-400 transition-colors">Tasks</Link>
              <span>·</span>
              <Link href="/dashboard/all-files" className="hover:text-gray-400 transition-colors">Files</Link>
              <span>·</span>
              <Link href="/dashboard/all-logs" className="hover:text-gray-400 transition-colors">Log</Link>
            </div>

            <div className="flex items-center gap-2 text-sm text-gray-400 border-l border-gray-800 pl-3">
              <span className="hidden sm:block text-gray-500">{profile?.full_name ?? user.email}</span>
              <button onClick={handleSignOut} className="rounded px-2 py-1 text-gray-600 hover:text-gray-300 transition-colors text-xs">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}

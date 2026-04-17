'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Database } from '@/types/supabase'
import type { User } from '@supabase/supabase-js'

type Entity = Database['public']['Tables']['entities']['Row']
type UserProfile = Database['public']['Tables']['user_profiles']['Row']

interface DashboardNavProps {
  user: User
  profile: (UserProfile & { orgs: Database['public']['Tables']['orgs']['Row'] | null }) | null
  entities: Entity[]
}

const ENTITY_LABELS: Record<string, string> = {
  tm: 'Triplemeter',
  sf: 'Streich Force',
  personal: 'Personal',
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
        <div className="flex h-16 items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2">
              <span className="text-xl">🏢</span>
              <span className="font-bold text-white">Sonja HQ</span>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              <Link href="/dashboard" className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors">
                All
              </Link>
              {entities.map((entity) => (
                <Link key={entity.id} href={`/dashboard?entity=${entity.type}`}
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-gray-200 hover:bg-gray-800/50 transition-colors flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: entity.color ?? '#6366F1' }} />
                  {ENTITY_LABELS[entity.type] ?? entity.name}
                </Link>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-1.5 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
              <span className="text-base leading-none">+</span>
              <span className="hidden sm:block">Capture</span>
            </button>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="hidden sm:block">{profile?.full_name ?? user.email}</span>
              <button onClick={handleSignOut} className="rounded px-2 py-1 text-gray-500 hover:text-gray-300 transition-colors text-xs">
                Sign out
              </button>
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}

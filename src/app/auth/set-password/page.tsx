import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SetPasswordForm } from './SetPasswordForm'

export const dynamic = 'force-dynamic'

interface SearchParams { error?: string }

export default async function SetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    redirect('/login?error=' + encodeURIComponent('Session expired — request a new link to continue'))
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-md px-6">
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="flex flex-col items-stretch" style={{ width: 52 }}>
            <div className="flex items-end justify-center" style={{ lineHeight: 1 }}>
              <span style={{ fontWeight: 900, fontSize: 34, color: '#111827', letterSpacing: '-0.03em', lineHeight: 1 }}>S</span>
              <span style={{ fontWeight: 900, fontSize: 34, color: 'var(--sf-red)', letterSpacing: '-0.03em', lineHeight: 1 }}>F</span>
            </div>
            <div style={{ height: 3, background: 'var(--sf-red)', marginTop: 4, width: '100%' }} />
          </div>
          <div className="text-center" style={{ marginTop: 2 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.01em', lineHeight: 1.1 }}>
              SONJA <span style={{ color: 'var(--sf-red)' }}>HQ</span>
            </div>
            <div className="sf-eyebrow" style={{ fontSize: 9, marginTop: 6 }}>
              Set your password
            </div>
          </div>
        </div>

        <SetPasswordForm error={searchParams.error} userEmail={user.email ?? ''} />

        <p className="sf-eyebrow text-center mt-6" style={{ fontSize: 10 }}>
          Streich Force · Sonja HQ
        </p>
      </div>
    </div>
  )
}

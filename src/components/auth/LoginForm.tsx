'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) { setError(error.message) } else { setSent(true) }
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="text-4xl mb-4">📬</div>
        <h2 className="text-gray-900 font-semibold text-lg mb-2">Check your email</h2>
        <p className="text-gray-500 text-sm">We sent a magic link to <span className="text-gray-900 font-medium">{email}</span></p>
      </div>
    )
  }

  return (
    <form onSubmit={handleLogin} className="rounded-lg border border-gray-200 bg-white p-8 space-y-4 shadow-sm">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Email address</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          className="w-full rounded-lg bg-white px-4 py-2 text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-indigo-400 transition-colors" />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button type="submit" disabled={loading}
        className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
        {loading ? 'Sending…' : 'Send magic link'}
      </button>
      <p className="text-center text-xs text-gray-500">No password required — we'll email you a secure link.</p>
    </form>
  )
}

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
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center">
        <div className="text-4xl mb-4">📬</div>
        <h2 className="text-white font-semibold text-lg mb-2">Check your email</h2>
        <p className="text-gray-400 text-sm">We sent a magic link to <span className="text-white">{email}</span></p>
      </div>
    )
  }

  return (
    <form onSubmit={handleLogin} className="rounded-lg border border-gray-800 bg-gray-900 p-8 space-y-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Email address</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          className="w-full rounded-lg bg-gray-950 px-4 py-2 text-white ring-1 ring-gray-700 outline-none" />
      </div>
      {error && <p className="text-red-400 text-sm">{error}</p>}
      <button type="submit" disabled={loading}
        className="w-full rounded-lg bg-indigo-600 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50 transition-colors">
        {loading ? 'Sending…' : 'Send magic link'}
      </button>
      <p className="text-center text-xs text-gray-500">No password required — we'll email you a secure link.</p>
    </form>
  )
}

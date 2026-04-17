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
        <p className="text-gray-400 text-sm">We sent a magic link to <span className="text-white">{email}</span>. Click it to sign in.</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleLogin} className="rounded-lg border border-gray-800 bg-gray-900 p-8">
      <div className="mb-6">
        <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">Email address</label>
        <input
          id="email" type="email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          required placeholder="sstreich1@outlook.com"
          className="w-full rounded-md border border-gray-700 bg-gray-800 px-3 py-2 text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={loading || !email}
        className="w-full rounded-md bg-indigo-600 px-4 py-2 text-white font-medium hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
        {loading ? 'Sending...' : 'Send magic link'}
      </button>
      <p className="mt-4 text-center text-xs text-gray-500">No password required — we'll email you a secure link.</p>
    </form>
  )
}

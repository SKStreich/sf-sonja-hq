'use client'

import { useState } from 'react'
import { signIn, requestPasswordReset } from '@/app/auth/actions'

interface Props {
  error?: string
  notice?: string
}

export function LoginForm({ error, notice }: Props) {
  const [mode, setMode] = useState<'signin' | 'reset'>('signin')

  if (notice === 'check-email') {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <div className="text-4xl mb-4">📬</div>
        <h2 className="text-gray-900 font-semibold text-lg mb-2">Check your email</h2>
        <p className="text-gray-500 text-sm">
          If an account exists for that email, we sent a link to set your password.
        </p>
        <a href="/login" className="mt-4 inline-block text-xs text-gray-500 hover:text-gray-700">
          ← Back to sign in
        </a>
      </div>
    )
  }

  if (mode === 'reset') {
    return (
      <form action={requestPasswordReset} className="rounded-lg border border-gray-200 bg-white p-8 space-y-4 shadow-sm">
        <h2 className="text-gray-900 font-semibold text-base">Set or reset your password</h2>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Email address</label>
          <input name="email" type="email" required autoFocus
            className="w-full rounded-lg bg-white px-4 py-2 text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-[color:var(--sf-red)] transition-colors" />
        </div>
        <button type="submit"
          className="w-full rounded-lg bg-[color:var(--sf-red)] py-2 text-sm font-semibold text-white hover:bg-[color:var(--sf-red-hot)] transition-colors">
          Email me a set-password link
        </button>
        <p className="text-center text-xs text-gray-500">
          First-time setting up or forgot your password? We'll send a one-time link to choose a new one.
        </p>
        <button type="button" onClick={() => setMode('signin')}
          className="block w-full text-center text-xs text-gray-500 hover:text-gray-700">
          ← Back to sign in
        </button>
      </form>
    )
  }

  return (
    <form action={signIn} className="rounded-lg border border-gray-200 bg-white p-8 space-y-4 shadow-sm">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Email address</label>
        <input name="email" type="email" required autoFocus
          className="w-full rounded-lg bg-white px-4 py-2 text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-[color:var(--sf-red)] transition-colors" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Password</label>
        <input name="password" type="password" required
          className="w-full rounded-lg bg-white px-4 py-2 text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-[color:var(--sf-red)] transition-colors" />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button type="submit"
        className="w-full rounded-lg bg-[color:var(--sf-red)] py-2 text-sm font-semibold text-white hover:bg-[color:var(--sf-red-hot)] transition-colors">
        Sign in
      </button>
      <button type="button" onClick={() => setMode('reset')}
        className="block w-full text-center text-xs text-gray-500 hover:text-gray-700">
        Forgot password or first-time setup?
      </button>
    </form>
  )
}

'use client'

import { updatePassword } from '@/app/auth/actions'

interface Props {
  error?: string
  userEmail: string
}

export function SetPasswordForm({ error, userEmail }: Props) {
  return (
    <form action={updatePassword} className="rounded-lg border border-gray-200 bg-white p-8 space-y-4 shadow-sm">
      <p className="text-xs text-gray-500">
        Setting password for <span className="text-gray-900 font-medium">{userEmail}</span>
      </p>
      <div>
        <label className="block text-xs text-gray-500 mb-1">New password</label>
        <input name="password" type="password" minLength={8} required autoFocus
          className="w-full rounded-lg bg-white px-4 py-2 text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-[color:var(--sf-red)] transition-colors" />
      </div>
      <div>
        <label className="block text-xs text-gray-500 mb-1">Confirm new password</label>
        <input name="confirm" type="password" minLength={8} required
          className="w-full rounded-lg bg-white px-4 py-2 text-gray-900 ring-1 ring-gray-200 outline-none focus:ring-[color:var(--sf-red)] transition-colors" />
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <button type="submit"
        className="w-full rounded-lg bg-[color:var(--sf-red)] py-2 text-sm font-semibold text-white hover:bg-[color:var(--sf-red-hot)] transition-colors">
        Set password and continue
      </button>
      <p className="text-center text-xs text-gray-500">
        At least 8 characters. You'll be signed in immediately.
      </p>
    </form>
  )
}

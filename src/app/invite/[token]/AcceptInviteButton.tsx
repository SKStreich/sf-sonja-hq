'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { acceptOrgInvite } from '@/app/api/members/actions'

export function AcceptInviteButton({ token }: { token: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState('')

  const handle = () => {
    setError('')
    startTransition(async () => {
      try {
        await acceptOrgInvite(token)
        router.push('/dashboard')
      } catch (e: any) {
        setError(e.message)
      }
    })
  }

  return (
    <div className="w-full">
      <button
        onClick={handle}
        disabled={pending}
        className="w-full rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
      >
        {pending ? 'Joining…' : 'Accept & Join'}
      </button>
      {error && <p className="mt-3 text-xs text-red-400">{error}</p>}
    </div>
  )
}

'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updateProfileName } from '@/app/api/profile/actions'

interface Props {
  userId: string
  fullName: string
  email: string
  role: string
  orgName: string
  memberSince: string // ISO date string
}

const ROLE_CONFIG: Record<string, { label: string; classes: string }> = {
  owner:     { label: 'Owner',  classes: 'bg-indigo-900/40 text-indigo-300' },
  admin:     { label: 'Admin',  classes: 'bg-purple-900/40 text-purple-300' },
  member:    { label: 'Member', classes: 'bg-gray-600/40 text-gray-300' },
  read_only: { label: 'Viewer', classes: 'bg-gray-700/40 text-gray-400' },
}

function getInitials(name: string, email: string): string {
  const source = name.trim() || email
  const parts = source.split(/[\s@]+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  } catch {
    return iso
  }
}

export function ProfileClient({ userId, fullName: initialFullName, email, role, orgName, memberSince }: Props) {
  const [fullName, setFullName] = useState(initialFullName)
  const [editing, setEditing] = useState(false)
  const [editValue, setEditValue] = useState(initialFullName)
  const [saveError, setSaveError] = useState('')
  const [isPending, startTransition] = useTransition()

  const roleConfig = ROLE_CONFIG[role] ?? ROLE_CONFIG['member']
  const initials = getInitials(fullName || '', email)

  const handleEdit = () => {
    setEditValue(fullName)
    setSaveError('')
    setEditing(true)
  }

  const handleCancel = () => {
    setEditing(false)
    setSaveError('')
  }

  const handleSave = () => {
    setSaveError('')
    startTransition(async () => {
      try {
        await updateProfileName(editValue)
        setFullName(editValue.trim())
        setEditing(false)
      } catch (e: any) {
        setSaveError(e.message ?? 'Failed to save')
      }
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSave()
    if (e.key === 'Escape') handleCancel()
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <Link href="/dashboard" className="text-xs uppercase tracking-wider text-gray-600 hover:text-gray-400 transition-colors">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-white">My Profile</h1>
      </div>

      {/* Identity card */}
      <section className="rounded-xl border border-gray-800 bg-gray-900/30 p-6 mb-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="h-16 w-16 shrink-0 rounded-full bg-indigo-900 flex items-center justify-center text-xl font-bold text-indigo-300 select-none">
            {initials}
          </div>

          {/* Identity details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-lg font-semibold text-white truncate">
                {fullName || email}
              </p>
              <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-medium ${roleConfig.classes}`}>
                {roleConfig.label}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-gray-500">{orgName}</p>
            <p className="mt-1 text-xs text-gray-600">Member since {formatDate(memberSince)}</p>
          </div>
        </div>
      </section>

      {/* Editable fields */}
      <section className="rounded-xl border border-gray-800 bg-gray-900/30 p-6 mb-6">
        <h2 className="text-base font-semibold text-white mb-5">Account Details</h2>

        {/* Display name */}
        <div className="mb-6">
          <label className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2 block">
            Display Name
          </label>
          {editing ? (
            <div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={editValue}
                  onChange={e => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  autoFocus
                  disabled={isPending}
                  className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-indigo-600 disabled:opacity-50 transition-colors"
                  placeholder="Your full name"
                />
                <button
                  onClick={handleSave}
                  disabled={isPending || !editValue.trim()}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors"
                >
                  {isPending ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={isPending}
                  className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-gray-200 hover:border-gray-600 disabled:opacity-40 transition-colors"
                >
                  Cancel
                </button>
              </div>
              {saveError && (
                <p className="mt-2 text-xs text-red-400">{saveError}</p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <p className="flex-1 text-sm text-gray-200">
                {fullName || <span className="text-gray-600 italic">No name set</span>}
              </p>
              <button
                onClick={handleEdit}
                className="shrink-0 text-xs text-gray-500 hover:text-indigo-400 transition-colors"
              >
                Edit
              </button>
            </div>
          )}
        </div>

        {/* Email (read-only) */}
        <div>
          <label className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2 block">
            Email Address
          </label>
          <div className="flex items-center gap-3">
            <p className="flex-1 text-sm text-gray-400">{email}</p>
            <span className="shrink-0 text-xs text-gray-700">Email cannot be changed here</span>
          </div>
        </div>
      </section>
    </div>
  )
}

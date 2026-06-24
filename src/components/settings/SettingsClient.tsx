'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { regenerateCaptureKey, regenerateUploadKey } from '@/app/api/captures/actions'
import { inviteOrgMember, revokeInvitation, resendInvitation, removeMember, updateMemberRole } from '@/app/api/members/actions'
import { testGranolaConnection, type GranolaConnectionStatus } from '@/app/api/integrations/granola/actions'

interface Member { id: string; full_name: string | null; email: string; role: string; created_at: string; active: boolean }
interface Invitation { id: string; email: string; role: string; status: string; created_at: string; expires_at: string; accepted_at?: string; token: string }

interface Props {
  captureApiKey: string
  uploadApiKey: string
  appUrl: string
  userEmail: string
  currentUserId: string
  currentUserRole: string
  members: Member[]
  pendingInvitations: Invitation[]
}

const ROLE_LABELS: Record<string, string> = {
  platform_owner: 'Owner',
  org_admin: 'Admin',
  supervisor: 'Supervisor',
  member: 'Member',
  read_only: 'Viewer',
}

type AssignableRole = 'org_admin' | 'supervisor' | 'member' | 'read_only'

export function SettingsClient({ captureApiKey: initialKey, uploadApiKey: initialUploadKey, appUrl, userEmail, currentUserId, currentUserRole, members: initialMembers, pendingInvitations: initialInvitations }: Props) {
  const [apiKey, setApiKey] = useState(initialKey)
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const [regenerating, startRegenerate] = useTransition()
  const [confirmRegen, setConfirmRegen] = useState(false)

  // Knowledge upload key (separate blast radius from the capture key)
  const [uploadKey, setUploadKey] = useState(initialUploadKey)
  const [uploadRevealed, setUploadRevealed] = useState(false)
  const [uploadCopied, setUploadCopied] = useState(false)
  const [uploadRegenerating, startUploadRegenerate] = useTransition()
  const [confirmUploadRegen, setConfirmUploadRegen] = useState(false)

  // Members state
  const [members, setMembers] = useState(initialMembers)
  const [invitations, setInvitations] = useState(initialInvitations)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<AssignableRole>('member')
  const [inviting, startInvite] = useTransition()
  const [inviteError, setInviteError] = useState('')
  const [inviteSuccess, setInviteSuccess] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [memberPending, startMember] = useTransition()
  const [memberFilter, setMemberFilter] = useState<'active' | 'removed'>('active')
  const [inviteFilter, setInviteFilter] = useState<'all' | 'pending' | 'accepted' | 'revoked'>('all')
  const [resending, startResend] = useTransition()
  const [resendSuccess, setResendSuccess] = useState<string | null>(null)
  const [showCustomMsg, setShowCustomMsg] = useState(false)
  const [customMessage, setCustomMessage] = useState('')
  const isAdmin = currentUserRole === 'platform_owner' || currentUserRole === 'org_admin'

  const endpoint = `${appUrl}/api/siri`
  const uploadEndpoint = `${appUrl}/api/knowledge/upload`

  // Granola integration (Sprint 13 foundation) — connection test only.
  const [granolaTesting, startGranolaTest] = useTransition()
  const [granolaStatus, setGranolaStatus] = useState<GranolaConnectionStatus | null>(null)
  const runGranolaTest = () => {
    setGranolaStatus(null)
    startGranolaTest(async () => {
      try { setGranolaStatus(await testGranolaConnection()) }
      catch (e: any) { setGranolaStatus({ ok: false, configured: false, message: e?.message ?? 'Test failed' }) }
    })
  }

  const handleInvite = () => {
    if (!inviteEmail.trim()) return
    setInviteError(''); setInviteSuccess(''); setInviteLink(''); setResendSuccess(null)
    startInvite(async () => {
      try {
        const result = await inviteOrgMember(inviteEmail.trim(), inviteRole, customMessage.trim() || undefined)
        // Add to local invitations list immediately so it shows without a page refresh
        setInvitations(prev => {
          const exists = prev.find(i => i.id === result.invitation.id)
          return exists
            ? prev.map(i => i.id === result.invitation.id ? { ...i, ...result.invitation } : i)
            : [result.invitation, ...prev]
        })
        setInviteFilter('pending')
        if (result.emailSent) {
          setInviteSuccess(`Invitation sent to ${result.invitation.email}`)
        } else {
          setInviteSuccess(`Invitation created — email failed to send. Share the link below directly.`)
        }
        setInviteLink(result.inviteUrl)
        setInviteEmail('')
        setCustomMessage('')
        setShowCustomMsg(false)
      } catch (e: any) {
        setInviteError(e.message)
      }
    })
  }

  const handleRevoke = (id: string) => {
    // Optimistic update — mark revoked immediately
    setInvitations(prev => prev.map(i => i.id === id ? { ...i, status: 'revoked' } : i))
    startMember(async () => {
      const result = await revokeInvitation(id)
      if (!result.success) {
        // Revert on failure — never throws so no Application Error page
        setInvitations(prev => prev.map(i => i.id === id ? { ...i, status: 'pending' } : i))
      }
    })
  }

  const handleResend = (id: string) => {
    // Clear both banners so only one shows at a time
    setResendSuccess(null); setInviteSuccess(''); setInviteLink('')
    startResend(async () => {
      try {
        const result = await resendInvitation(id)
        setInvitations(prev => prev.map(i => i.id === id ? { ...i, status: 'pending' } : i))
        setResendSuccess(result.inviteUrl)
      } catch {}
    })
  }

  const handleRemoveMember = (id: string) => {
    // Optimistic soft-deactivate — mark inactive so it moves to "Removed" tab
    setMembers(prev => prev.map(m => m.id === id ? { ...m, active: false } : m))
    startMember(async () => {
      const result = await removeMember(id)
      if (!result.success) {
        // Revert on failure — restore active state
        setMembers(prev => prev.map(m => m.id === id ? { ...m, active: true } : m))
      }
    })
  }

  const handleRoleChange = (memberId: string, role: AssignableRole) => {
    // Optimistic role update
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role } : m))
    startMember(async () => {
      const result = await updateMemberRole(memberId, role)
      if (!result.success) {
        // Revert on failure
        setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: m.role } : m))
      }
    })
  }

  const copy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const regen = () => {
    if (!confirmRegen) { setConfirmRegen(true); return }
    startRegenerate(async () => {
      const newKey = await regenerateCaptureKey()
      setApiKey(newKey)
      setConfirmRegen(false)
      setRevealed(true)
    })
  }

  const maskedKey = apiKey ? apiKey.slice(0, 8) + '••••••••••••••••••••••••••••' : '—'

  const copyUpload = (text: string) => {
    navigator.clipboard.writeText(text)
    setUploadCopied(true)
    setTimeout(() => setUploadCopied(false), 1500)
  }

  const regenUpload = () => {
    if (!confirmUploadRegen) { setConfirmUploadRegen(true); return }
    startUploadRegenerate(async () => {
      const newKey = await regenerateUploadKey()
      setUploadKey(newKey)
      setConfirmUploadRegen(false)
      setUploadRevealed(true)
    })
  }

  const maskedUploadKey = uploadKey ? uploadKey.slice(0, 8) + '••••••••••••••••••••••••••••' : '—'

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-8">
        <Link href="/dashboard" className="text-xs uppercase tracking-wider text-gray-500 hover:text-gray-700 transition-colors">
          ← Dashboard
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-0.5 text-sm text-gray-500">{userEmail}</p>
      </div>

      {/* Siri / External Capture */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Siri Shortcuts & External Capture</h2>
        <p className="text-sm text-gray-500 mb-5">
          Use your personal API key to send captures to HQ from anywhere — Siri, iOS Shortcuts, automation tools, or any HTTP client.
        </p>

        {/* API Key */}
        <div className="mb-5">
          <label className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2 block">Your Capture API Key</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 font-mono text-sm text-gray-700">
              {revealed ? apiKey : maskedKey}
            </div>
            <button
              onClick={() => setRevealed(r => !r)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 hover:border-gray-600 transition-colors"
            >
              {revealed ? 'Hide' : 'Show'}
            </button>
            <button
              onClick={() => copy(apiKey)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 hover:border-gray-600 transition-colors"
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {confirmRegen && (
              <span className="text-xs text-yellow-500">This will break existing shortcuts. Confirm?</span>
            )}
            <button
              onClick={regen}
              disabled={regenerating}
              className={`text-xs transition-colors ${confirmRegen ? 'text-red-400 hover:text-red-300' : 'text-gray-700 hover:text-gray-500'}`}
            >
              {regenerating ? 'Regenerating…' : confirmRegen ? 'Yes, regenerate' : 'Regenerate key'}
            </button>
            {confirmRegen && (
              <button onClick={() => setConfirmRegen(false)} className="text-xs text-gray-700 hover:text-gray-500 transition-colors">Cancel</button>
            )}
          </div>
        </div>

        {/* Endpoint */}
        <div className="mb-6">
          <label className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2 block">Capture Endpoint</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 font-mono text-xs text-gray-700 break-all">
              {endpoint}
            </div>
            <button
              onClick={() => copy(endpoint)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Siri Setup Instructions */}
        <div className="rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">📱 Set Up Siri Shortcut</h3>
          <ol className="space-y-3 text-sm text-gray-700">
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">1</span>
              <span>Open the <strong className="text-gray-700">Shortcuts</strong> app on your iPhone and tap <strong className="text-gray-700">+</strong> to create a new shortcut.</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">2</span>
              <span>Add a <strong className="text-gray-700">Dictate Text</strong> action (or <em>Ask for Input</em> if you prefer to type).</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">3</span>
              <span>Add a <strong className="text-gray-700">Get Contents of URL</strong> action. Set it to:</span>
            </li>
          </ol>
          <div className="mt-3 ml-8 rounded-lg bg-gray-50 border border-gray-300 p-3 font-mono text-xs text-gray-700 space-y-1">
            <div><span className="text-gray-600">URL: </span><span className="text-indigo-700">{endpoint}</span></div>
            <div><span className="text-gray-600">Method: </span><span className="text-green-700">POST</span></div>
            <div><span className="text-gray-600">Headers: </span><span className="text-yellow-400">Authorization: Bearer [your key]</span></div>
            <div><span className="text-gray-600">Body (JSON): </span><span className="text-gray-700">{'{"text": [Dictated Text], "type": "task"}'}</span></div>
          </div>
          <ol className="space-y-3 text-sm text-gray-700 mt-3" start={4}>
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">4</span>
              <span>Name the shortcut <strong className="text-gray-700">&ldquo;Capture to HQ&rdquo;</strong> and add it to Siri — say <em>&ldquo;Hey Siri, Capture to HQ&rdquo;</em>.</span>
            </li>
            <li className="flex gap-3">
              <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 text-xs flex items-center justify-center font-bold">5</span>
              <span>Your capture will appear in the HQ dashboard instantly. Set <code className="text-indigo-700">type</code> to <code className="text-indigo-700">&ldquo;idea&rdquo;</code> for ideas or <code className="text-indigo-700">&ldquo;task&rdquo;</code> for tasks.</span>
            </li>
          </ol>
        </div>

        {/* Quick test */}
        <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Test with curl</h3>
          <pre className="text-xs text-gray-500 whitespace-pre-wrap break-all font-mono leading-relaxed">
{`curl -X POST ${endpoint} \\
  -H "Authorization: Bearer ${revealed ? apiKey : '<your-api-key>'}" \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Test capture from terminal","type":"task"}'`}
          </pre>
        </div>
      </section>

      {/* Knowledge Upload API Key */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Knowledge Upload API Key</h2>
        <p className="text-sm text-gray-500 mb-5">
          Use this key to push files into your Knowledge Hub from outside the app — CLI scripts, automation, or any HTTP client.
          It&rsquo;s <strong>separate from your Capture key</strong> so the two have independent blast radius.
        </p>

        {/* Upload key */}
        <div className="mb-5">
          <label className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2 block">Your Upload API Key</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 font-mono text-sm text-gray-700">
              {uploadRevealed ? uploadKey : maskedUploadKey}
            </div>
            <button
              onClick={() => setUploadRevealed(r => !r)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 hover:border-gray-600 transition-colors"
            >
              {uploadRevealed ? 'Hide' : 'Show'}
            </button>
            <button
              onClick={() => copyUpload(uploadKey)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 hover:border-gray-600 transition-colors"
            >
              {uploadCopied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            {confirmUploadRegen && (
              <span className="text-xs text-yellow-500">This will break existing upload scripts. Confirm?</span>
            )}
            <button
              onClick={regenUpload}
              disabled={uploadRegenerating}
              className={`text-xs transition-colors ${confirmUploadRegen ? 'text-red-400 hover:text-red-300' : 'text-gray-700 hover:text-gray-500'}`}
            >
              {uploadRegenerating ? 'Regenerating…' : confirmUploadRegen ? 'Yes, regenerate' : 'Regenerate key'}
            </button>
            {confirmUploadRegen && (
              <button onClick={() => setConfirmUploadRegen(false)} className="text-xs text-gray-700 hover:text-gray-500 transition-colors">Cancel</button>
            )}
          </div>
        </div>

        {/* Upload endpoint */}
        <div className="mb-6">
          <label className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2 block">Upload Endpoint</label>
          <div className="flex items-center gap-2">
            <div className="flex-1 rounded-lg border border-gray-300 bg-gray-50 px-4 py-2.5 font-mono text-xs text-gray-700 break-all">
              {uploadEndpoint}
            </div>
            <button
              onClick={() => copyUpload(uploadEndpoint)}
              className="rounded-lg border border-gray-300 px-3 py-2.5 text-xs text-gray-500 hover:text-gray-700 transition-colors"
            >
              Copy
            </button>
          </div>
        </div>

        {/* Quick test */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-2">Upload a file with curl</h3>
          <pre className="text-xs text-gray-500 whitespace-pre-wrap break-all font-mono leading-relaxed">
{`curl -X POST ${uploadEndpoint} \\
  -H "Authorization: Bearer ${uploadRevealed ? uploadKey : '<your-upload-key>'}" \\
  -F "file=@./my-doc.html" \\
  -F "entity=sfe" \\
  -F "kind=doc" \\
  -F "tags=infra,reference"`}
          </pre>
          <p className="mt-2 text-xs text-gray-500">
            <code className="text-indigo-700">entity</code> is one of <code className="text-indigo-700">tm · sf · sfe · personal</code>;
            <code className="text-indigo-700"> kind</code> defaults to <code className="text-indigo-700">doc</code>.
          </p>
        </div>
      </section>

      {/* Granola integration (Sprint 13 foundation) */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Granola</h2>
        <p className="text-sm text-gray-500 mb-4">
          Set <code className="text-indigo-700">GRANOLA_API_KEY</code> in Vercel (Settings → Environment Variables,
          Production scope) to your <code className="text-indigo-700">grn_…</code> token. The Granola → triage-inbox
          importer ships next session; this just verifies the token reaches the API.
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={runGranolaTest}
            disabled={granolaTesting}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {granolaTesting ? 'Testing…' : 'Test connection'}
          </button>
          {granolaStatus && (
            <span className={`text-sm ${granolaStatus.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {granolaStatus.ok ? '✓ ' : '✕ '}{granolaStatus.message}
            </span>
          )}
        </div>
      </section>

      {/* Team Members */}
      <section className="rounded-xl border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-1">Team Members</h2>
        <p className="text-sm text-gray-500 mb-5">
          {isAdmin ? 'Manage who has access to your HQ.' : 'People with access to this HQ.'}
        </p>

        {/* Member filter tabs */}
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-600">People</p>
          <div className="flex gap-1">
            {(['active', 'removed'] as const).map(f => {
              const count = f === 'active'
                ? members.filter(m => m.active !== false).length
                : members.filter(m => m.active === false).length
              return (
                <button
                  key={f}
                  onClick={() => setMemberFilter(f)}
                  className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                    memberFilter === f ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                  {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* Member list */}
        <ul className="space-y-2 mb-6">
          {members
            .filter(m => memberFilter === 'active' ? m.active !== false : m.active === false)
            .map(m => {
              const isRemoved = m.active === false
              return (
                <li key={m.id} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${
                  isRemoved ? 'border-gray-200 opacity-50' : 'border-gray-200'
                }`}>
                  <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isRemoved ? 'bg-gray-100 text-gray-600' : 'bg-indigo-100 text-indigo-700'
                  }`}>
                    {(m.full_name ?? m.email)[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${isRemoved ? 'text-gray-600 line-through' : 'text-gray-900'}`}>{m.full_name ?? m.email}</p>
                    {m.full_name && <p className="text-xs text-gray-600 truncate">{m.email}</p>}
                  </div>
                  {!isRemoved && isAdmin && m.id !== currentUserId && m.role !== 'platform_owner' ? (
                    <select
                      value={m.role}
                      onChange={e => handleRoleChange(m.id, e.target.value as any)}
                      disabled={memberPending}
                      className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700 outline-none"
                    >
                      <option value="org_admin">Admin</option>
                      <option value="supervisor">Supervisor</option>
                      <option value="member">Member</option>
                      <option value="read_only">Viewer</option>
                    </select>
                  ) : (
                    <span className="text-xs text-gray-500 shrink-0">
                      {isRemoved ? 'Removed' : (ROLE_LABELS[m.role] ?? m.role)}
                    </span>
                  )}
                  {!isRemoved && isAdmin && m.id !== currentUserId && m.role !== 'platform_owner' && (
                    <button
                      onClick={() => handleRemoveMember(m.id)}
                      disabled={memberPending}
                      className="text-xs text-gray-700 hover:text-red-400 transition-colors shrink-0"
                      title="Remove member"
                    >✕</button>
                  )}
                  {m.id === currentUserId && (
                    <span className="text-xs text-gray-700 shrink-0">You</span>
                  )}
                </li>
              )
            })}
          {members.filter(m => memberFilter === 'active' ? m.active !== false : m.active === false).length === 0 && (
            <li className="text-center py-6 text-xs text-gray-700">
              {memberFilter === 'removed' ? 'No removed members.' : 'No active members.'}
            </li>
          )}
        </ul>

        {/* Invitations */}
        {isAdmin && invitations.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium uppercase tracking-wider text-gray-600">Invitations</p>
              {/* Filter tabs */}
              <div className="flex gap-1">
                {(['all', 'pending', 'accepted', 'revoked'] as const).map(f => {
                  const count = f === 'all' ? invitations.length : invitations.filter(i => i.status === f || (f === 'revoked' && i.status === 'expired')).length
                  return (
                    <button
                      key={f}
                      onClick={() => setInviteFilter(f)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                        inviteFilter === f
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                      {count > 0 && <span className="ml-1 opacity-60">{count}</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {resendSuccess && (
              <div className="mb-3 rounded-lg border border-indigo-900/50 bg-indigo-950/30 p-3">
                <p className="text-xs text-indigo-400 mb-1.5">Invitation resent — share this link if email didn't arrive:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-gray-700 font-mono truncate">{resendSuccess}</code>
                  <button onClick={() => copy(resendSuccess)} className="shrink-0 rounded bg-indigo-600 px-2.5 py-1 text-xs text-gray-900 hover:bg-indigo-600 transition-colors">Copy</button>
                </div>
              </div>
            )}

            <ul className="space-y-2">
              {invitations
                .filter(inv => {
                  if (inviteFilter === 'all') return true
                  if (inviteFilter === 'revoked') return inv.status === 'revoked' || inv.status === 'expired'
                  return inv.status === inviteFilter
                })
                .map(inv => {
                  const isPending = inv.status === 'pending'
                  const isAccepted = inv.status === 'accepted'
                  const isRevoked = inv.status === 'revoked' || inv.status === 'expired'

                  return (
                    <li key={inv.id} className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 ${
                      isPending ? 'border-dashed border-gray-200' :
                      isAccepted ? 'border-green-900/40 bg-green-950/10' :
                      'border-gray-200 opacity-60'
                    }`}>
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center text-xs shrink-0 ${
                        isAccepted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {isAccepted ? '✓' : '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm text-gray-700 truncate">{inv.email}</p>
                          <span className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                            isPending ? 'bg-yellow-900/30 text-yellow-500' :
                            isAccepted ? 'bg-green-900/30 text-green-700' :
                            'bg-gray-100 text-gray-500'
                          }`}>
                            {inv.status === 'expired' ? 'expired' : inv.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600">
                          {ROLE_LABELS[inv.role]}
                          {isAccepted && inv.accepted_at
                            ? ` · accepted ${new Date(inv.accepted_at).toLocaleDateString()}`
                            : isPending
                            ? ` · expires ${new Date(inv.expires_at).toLocaleDateString()}`
                            : ` · invited ${new Date(inv.created_at).toLocaleDateString()}`}
                        </p>
                      </div>
                      {isPending && (
                        <>
                          <button
                            onClick={() => copy(`${appUrl}/invite/${inv.token}`)}
                            className="text-xs text-gray-600 hover:text-indigo-400 transition-colors shrink-0"
                            title="Copy invite link"
                          >Copy link</button>
                          <button
                            onClick={() => handleResend(inv.id)}
                            disabled={resending || memberPending}
                            className="text-xs text-gray-600 hover:text-indigo-400 transition-colors shrink-0"
                            title="Resend invite email"
                          >{resending ? '…' : 'Resend'}</button>
                          <button
                            onClick={() => handleRevoke(inv.id)}
                            disabled={memberPending}
                            className="text-xs text-gray-700 hover:text-red-400 transition-colors shrink-0"
                            title="Cancel invitation"
                          >Cancel</button>
                        </>
                      )}
                    </li>
                  )
                })}
            </ul>
          </div>
        )}

        {/* Invite form */}
        {isAdmin && (
          <div className="rounded-lg border border-gray-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-600 mb-3">Invite Someone</p>
            <div className="flex items-center gap-2">
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleInvite()}
                placeholder="email@example.com"
                className="flex-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 outline-none focus:border-gray-600"
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as any)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 outline-none"
              >
                <option value="member">Member</option>
                <option value="supervisor">Supervisor</option>
                <option value="org_admin">Admin</option>
                <option value="read_only">Viewer</option>
              </select>
              <button
                onClick={handleInvite}
                disabled={!inviteEmail.trim() || inviting}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-indigo-500 disabled:opacity-40 transition-colors"
              >
                {inviting ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowCustomMsg(v => !v)}
                className="text-xs text-gray-500 hover:text-gray-700 transition-colors"
              >
                {showCustomMsg ? '▾ Hide personal message' : '▸ Add a personal message'}
              </button>
              {showCustomMsg && (
                <textarea
                  value={customMessage}
                  onChange={e => setCustomMessage(e.target.value)}
                  placeholder="Add a personal note to your invitation email…"
                  rows={3}
                  className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-gray-600 resize-none"
                />
              )}
            </div>
            {inviteError && <p className="mt-2 text-xs text-red-400">{inviteError}</p>}
            {inviteSuccess && (
              <p className={`mt-2 text-xs ${inviteSuccess.includes('email failed') ? 'text-yellow-500' : 'text-green-700'}`}>
                {inviteSuccess}
              </p>
            )}
            {inviteLink && (
              <div className="mt-3 rounded-lg border border-indigo-900/50 bg-indigo-950/30 p-3">
                <p className="text-xs text-indigo-400 mb-1.5">Share this link directly if the email didn't arrive:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs text-gray-700 font-mono truncate">{inviteLink}</code>
                  <button
                    onClick={() => { copy(inviteLink); }}
                    className="shrink-0 rounded bg-indigo-600 px-2.5 py-1 text-xs text-gray-900 hover:bg-indigo-600 transition-colors"
                  >Copy</button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  )
}

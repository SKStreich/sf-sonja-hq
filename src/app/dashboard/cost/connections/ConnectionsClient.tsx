'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  upsertServiceConfig, deleteServiceConfig, checkServiceApiKeyPresence,
  type ServiceConfig,
} from '@/app/api/usage/actions'

const KNOWN_SERVICES: Array<{ slug: string; label: string; envName: string; defaultFee?: number; notes?: string }> = [
  { slug: 'supabase',  label: 'Supabase',  envName: 'SUPABASE_MANAGEMENT_API_KEY', defaultFee: 0,    notes: 'Database + auth + storage. Free tier includes 500 MB DB + 1 GB storage. Pro tier ($25/mo) adds daily backups + cross-region storage.' },
  { slug: 'vercel',    label: 'Vercel',    envName: 'VERCEL_TOKEN',                defaultFee: 0,    notes: 'Hosting + edge functions + analytics. Hobby tier is free; Pro ($20/mo) adds advanced analytics.' },
  { slug: 'anthropic', label: 'Anthropic / Claude API', envName: 'ANTHROPIC_API_KEY',       defaultFee: 0, notes: 'Pay-as-you-go. The HQ Agent + critique features both call this API.' },
  { slug: 'openai',    label: 'OpenAI / Whisper', envName: 'OPENAI_API_KEY',       defaultFee: 0,    notes: 'Voice transcription (Whisper) + embeddings if/when added.' },
  { slug: 'resend',    label: 'Resend',    envName: 'RESEND_API_KEY',              defaultFee: 0,    notes: 'Transactional email. Free tier includes 3,000 emails/month.' },
  { slug: 'netlify',   label: 'Netlify',   envName: 'NETLIFY_API_TOKEN',           defaultFee: 0,    notes: 'Optional — only if you host any sites here.' },
  { slug: 'cloudflare-r2', label: 'Cloudflare R2', envName: 'CLOUDFLARE_R2_TOKEN', defaultFee: 0,    notes: 'Off-platform storage backup target (recommended for DR plan Standard tier).' },
  { slug: 'github',    label: 'GitHub',    envName: 'GITHUB_TOKEN',                defaultFee: 0,    notes: 'Repo hosting. Free for personal use.' },
]

export function ConnectionsClient({ initial }: { initial: ServiceConfig[] }) {
  const router = useRouter()
  const [configs, setConfigs] = useState<ServiceConfig[]>(initial)
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')

  const refresh = async () => {
    // Server action returns void on upsert; re-fetch via router refresh + a fresh server roundtrip.
    router.refresh()
  }

  // Suggested services not yet configured
  const configured = new Set(configs.map(c => c.service))
  const suggestions = KNOWN_SERVICES.filter(s => !configured.has(s.slug))

  return (
    <div className="space-y-6">
      {err && <div className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500">Configured services</h2>
          <button onClick={() => { setAdding(true); setEditing(null) }}
            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500">
            + New connection
          </button>
        </div>

        {adding && (
          <ConnectionForm
            initial={null}
            knownServices={KNOWN_SERVICES}
            onCancel={() => setAdding(false)}
            onSaved={() => { setAdding(false); refresh() }}
          />
        )}

        {configs.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 bg-white px-4 py-8 text-center text-sm text-gray-500">
            No connections yet. Click <strong>+ New connection</strong> or pick a suggestion below to add one.
          </p>
        ) : (
          <ul className="space-y-2">
            {configs.map(c => (
              <li key={c.service} className="rounded-lg border border-gray-200 bg-white">
                {editing === c.service ? (
                  <div className="p-4">
                    <ConnectionForm
                      initial={c}
                      knownServices={KNOWN_SERVICES}
                      onCancel={() => setEditing(null)}
                      onSaved={() => { setEditing(null); refresh() }}
                    />
                  </div>
                ) : (
                  <ConnectionRow
                    config={c}
                    busy={busy}
                    onEdit={() => { setEditing(c.service); setAdding(false) }}
                    onDelete={() => {
                      if (!confirm(`Delete the ${c.display_name ?? c.service} connection? Past usage rows are preserved.`)) return
                      startBusy(async () => {
                        try { await deleteServiceConfig(c.service); setConfigs(prev => prev.filter(x => x.service !== c.service)) }
                        catch (e: any) { setErr(e?.message ?? 'Delete failed') }
                      })
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {suggestions.length > 0 && (
        <section>
          <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-500">Suggested services</h2>
          <p className="mb-2 text-xs text-gray-500">Quick-add from common HQ providers. You can edit details after.</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {suggestions.map(s => (
              <button
                key={s.slug}
                onClick={() => {
                  startBusy(async () => {
                    try {
                      await upsertServiceConfig({
                        service: s.slug,
                        display_name: s.label,
                        api_key_env_name: s.envName,
                        monthly_fee_usd: s.defaultFee ?? 0,
                        notes: s.notes ?? null,
                        status: 'active',
                      })
                      router.refresh()
                    } catch (e: any) { setErr(e?.message ?? 'Save failed') }
                  })
                }}
                disabled={busy}
                className="flex items-start gap-2 rounded-lg border border-dashed border-gray-300 bg-white p-3 text-left hover:border-indigo-300 hover:bg-indigo-50 disabled:opacity-40"
              >
                <span className="text-base leading-tight">+</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{s.label}</div>
                  {s.notes && <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{s.notes}</div>}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function ConnectionRow({
  config, onEdit, onDelete, busy,
}: {
  config: ServiceConfig
  onEdit: () => void
  onDelete: () => void
  busy: boolean
}) {
  const [keyState, setKeyState] = useState<'unknown' | 'set' | 'missing'>('unknown')
  const checkKey = async () => {
    if (!config.api_key_env_name) return
    const r = await checkServiceApiKeyPresence(config.api_key_env_name)
    setKeyState(r.set ? 'set' : 'missing')
  }
  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">{config.display_name ?? config.service}</span>
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-mono text-gray-600">{config.service}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
            config.status === 'active'
              ? 'bg-green-100 text-green-700'
              : 'bg-gray-100 text-gray-500'
          }`}>{config.status}</span>
        </div>
        <div className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 text-xs text-gray-600 sm:grid-cols-2">
          <div>
            <span className="text-gray-400">Monthly fee:</span>{' '}
            <strong className="text-gray-900">${config.monthly_fee_usd.toFixed(2)}</strong>
          </div>
          {config.billing_anchor_day && (
            <div><span className="text-gray-400">Billing day:</span> {config.billing_anchor_day}</div>
          )}
          {config.api_key_env_name && (
            <div className="col-span-full">
              <span className="text-gray-400">API key env:</span>{' '}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">{config.api_key_env_name}</code>{' '}
              {keyState === 'unknown' ? (
                <button onClick={checkKey} className="ml-1 text-indigo-600 hover:underline">check</button>
              ) : keyState === 'set' ? (
                <span className="text-green-700">✓ set on server</span>
              ) : (
                <span className="text-red-700">⚠ not set</span>
              )}
            </div>
          )}
          {config.notes && (
            <p className="col-span-full mt-1 text-gray-500">{config.notes}</p>
          )}
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button onClick={onEdit} disabled={busy}
          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-40">
          Edit
        </button>
        <button onClick={onDelete} disabled={busy}
          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40">
          Delete
        </button>
      </div>
    </div>
  )
}

function ConnectionForm({
  initial, knownServices, onCancel, onSaved,
}: {
  initial: ServiceConfig | null
  knownServices: typeof KNOWN_SERVICES
  onCancel: () => void
  onSaved: () => void
}) {
  const [service, setService] = useState(initial?.service ?? '')
  const [displayName, setDisplayName] = useState(initial?.display_name ?? '')
  const [status, setStatus] = useState<'active' | 'paused'>(initial?.status ?? 'active')
  const [monthlyFee, setMonthlyFee] = useState(String(initial?.monthly_fee_usd ?? 0))
  const [billingDay, setBillingDay] = useState(initial?.billing_anchor_day?.toString() ?? '')
  const [envName, setEnvName] = useState(initial?.api_key_env_name ?? '')
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [busy, startBusy] = useTransition()
  const [err, setErr] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setErr('')
    startBusy(async () => {
      try {
        await upsertServiceConfig({
          service,
          display_name: displayName,
          status,
          monthly_fee_usd: Number(monthlyFee) || 0,
          billing_anchor_day: billingDay ? Number(billingDay) : null,
          api_key_env_name: envName || null,
          notes: notes || null,
        })
        onSaved()
      } catch (e: any) { setErr(e?.message ?? 'Save failed') }
    })
  }

  return (
    <form onSubmit={submit} className="grid grid-cols-2 gap-3 rounded-lg border border-indigo-200 bg-indigo-50/30 p-4 text-sm">
      <Field label="Service slug *" tooltip="Lowercase id, e.g. 'vercel' or 'supabase'.">
        <input value={service} onChange={e => setService(e.target.value)} required disabled={!!initial}
          placeholder="e.g. vercel"
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900 disabled:opacity-60" />
      </Field>
      <Field label="Display name" tooltip="What appears on the cost dashboard.">
        <input value={displayName} onChange={e => setDisplayName(e.target.value)}
          placeholder="e.g. Vercel"
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900" />
      </Field>
      <Field label="Monthly subscription fee (USD)" tooltip="Flat fee billed each month, added to MTD spend.">
        <input type="number" min={0} step="0.01" value={monthlyFee} onChange={e => setMonthlyFee(e.target.value)}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900" />
      </Field>
      <Field label="Billing anchor day" tooltip="Day of month the bill resets, 1-28. Leave blank if calendar month.">
        <input type="number" min={1} max={28} value={billingDay} onChange={e => setBillingDay(e.target.value)}
          placeholder="(optional)"
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900" />
      </Field>
      <Field label="API key env-var name" tooltip="The Vercel env var that holds the API key for live syncs.">
        <input value={envName} onChange={e => setEnvName(e.target.value)}
          placeholder="e.g. VERCEL_TOKEN"
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 font-mono text-xs text-gray-900" />
      </Field>
      <Field label="Status">
        <select value={status} onChange={e => setStatus(e.target.value as any)}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900">
          <option value="active">Active</option>
          <option value="paused">Paused (skip during sync)</option>
        </select>
      </Field>
      <Field label="Notes" tooltip="Free-form. Document what this connection covers, gotchas, account links." span={2}>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          className="w-full rounded border border-gray-300 bg-white px-2 py-1.5 text-gray-900" />
      </Field>
      {err && <div className="col-span-2 rounded bg-red-50 px-3 py-2 text-red-700">{err}</div>}
      <div className="col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel}
          className="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50">Cancel</button>
        <button type="submit" disabled={busy}
          className="rounded-md bg-indigo-600 px-3 py-1.5 font-medium text-white hover:bg-indigo-500 disabled:opacity-40">
          {busy ? 'Saving…' : initial ? 'Save changes' : 'Add connection'}
        </button>
      </div>
    </form>
  )
}

function Field({ label, children, tooltip, span = 1 }: { label: string; children: React.ReactNode; tooltip?: string; span?: 1 | 2 }) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <label className="mb-1 block text-xs font-medium text-gray-700" title={tooltip}>{label}</label>
      {children}
    </div>
  )
}

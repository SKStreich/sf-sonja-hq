'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { addManualEntry, deleteUsageEntry, syncAllUsage, setServiceStatus, type SyncResult, type ServiceConfig, type ServiceStatus } from '@/app/api/usage/actions'

type UsageRow = any

const SERVICE_META: Record<string, { label: string; icon: string; color: string; unitLabel: string; pricingNote: string }> = {
  anthropic: { label: 'Anthropic / Claude',  icon: '🤖', color: 'text-purple-400',  unitLabel: 'tokens',   pricingNote: '$3/M input · $15/M output' },
  openai:    { label: 'OpenAI / Whisper',    icon: '🎙', color: 'text-green-400',   unitLabel: 'minutes',  pricingNote: '$0.006/min' },
  supabase:  { label: 'Supabase',            icon: '🗄',  color: 'text-emerald-400', unitLabel: 'requests', pricingNote: 'Free · Pro $25/mo' },
  vercel:    { label: 'Vercel',              icon: '▲',   color: 'text-white',       unitLabel: 'deploys',  pricingNote: 'Hobby free · Pro $20/mo' },
  netlify:   { label: 'Netlify',             icon: '◈',   color: 'text-teal-400',    unitLabel: 'builds',   pricingNote: 'Starter free · Pro $19/mo' },
  resend:    { label: 'Resend',              icon: '✉',   color: 'text-blue-400',    unitLabel: 'emails',   pricingNote: '$0.80/1k emails' },
  other:     { label: 'Other',               icon: '⚙',   color: 'text-gray-400',    unitLabel: 'units',    pricingNote: '' },
}

const TRACKED_SERVICES = ['anthropic', 'openai', 'supabase', 'vercel', 'netlify', 'resend'] as const

const SERVICES = Object.keys(SERVICE_META) as (keyof typeof SERVICE_META)[]

function fmtCost(n: number) {
  if (n === 0) return '$0.00'
  if (n < 0.01) return '<$0.01'
  return '$' + n.toFixed(2)
}

function fmtDate(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function SpendChart({ usage }: { usage: UsageRow[] }) {
  const width = 560; const height = 80; const barW = 14; const gap = 4

  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    days.push(d.toISOString().slice(0, 10))
  }

  const byDay: Record<string, number> = {}
  for (const row of usage) {
    const d = row.period_start?.slice(0, 10)
    if (d && days.includes(d)) byDay[d] = (byDay[d] ?? 0) + Number(row.cost_usd)
  }

  const maxVal = Math.max(...days.map(d => byDay[d] ?? 0), 0.01)

  return (
    <svg viewBox={`0 0 ${width} ${height + 20}`} className="w-full" style={{ height: 100 }}>
      {days.map((d, i) => {
        const val = byDay[d] ?? 0
        const barH = Math.max((val / maxVal) * height, val > 0 ? 2 : 0)
        const x = i * (barW + gap)
        const today = new Date().toISOString().slice(0, 10)
        return (
          <g key={d}>
            <rect x={x} y={height - barH} width={barW} height={barH} rx={2}
              fill={d === today ? '#6366f1' : '#374151'} opacity={val > 0 ? 1 : 0.3} />
            {(i === 0 || i === 14 || i === 29) && (
              <text x={x + barW / 2} y={height + 14} textAnchor="middle" fontSize={9} fill="#6b7280">
                {fmtDate(d)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}

function AddEntryForm({ onDone }: { onDone: () => void }) {
  const [service, setService] = useState('supabase')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [cost, setCost] = useState('')
  const [units, setUnits] = useState('')
  const [notes, setNotes] = useState('')
  const [pending, startTransition] = useTransition()

  const submit = () => {
    const costNum = parseFloat(cost)
    if (!cost || isNaN(costNum) || costNum < 0) return
    startTransition(async () => {
      await addManualEntry({ service, date, cost_usd: costNum, units: units ? parseFloat(units) : undefined, metric_type: 'manual_entry', notes: notes || undefined })
      onDone()
    })
  }

  return (
    <div className="rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Service</label>
          <select value={service} onChange={e => setService(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none">
            {SERVICES.map(s => <option key={s} value={s}>{SERVICE_META[s].label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none" />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Cost (USD)</label>
          <input type="number" step="0.01" min="0" value={cost} onChange={e => setCost(e.target.value)}
            placeholder="0.00" className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none placeholder-gray-600" />
        </div>
        <div>
          <label className="text-xs text-gray-500 uppercase tracking-wider block mb-1">Units (optional)</label>
          <input type="number" value={units} onChange={e => setUnits(e.target.value)}
            placeholder="e.g. 1000" className="w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white outline-none placeholder-gray-600" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes (e.g. April invoice)"
          className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-400 outline-none placeholder-gray-600" />
        <button onClick={onDone} className="text-xs text-gray-600 hover:text-gray-400 transition-colors">Cancel</button>
        <button onClick={submit} disabled={!cost || pending}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-40 transition-colors">
          {pending ? 'Saving…' : 'Add'}
        </button>
      </div>
    </div>
  )
}

interface Props {
  usage: UsageRow[]
  serviceConfig: Record<string, boolean>
  serviceConfigs: ServiceConfig[]
}

export function CostDashboard({ usage, serviceConfig, serviceConfigs }: Props) {
  const [addingEntry, setAddingEntry] = useState(false)
  const [syncing, startSync] = useTransition()
  const [syncResults, setSyncResults] = useState<SyncResult[] | null>(null)
  const [deleting, startDelete] = useTransition()
  const [togglingService, startToggle] = useTransition()
  const [localConfigs, setLocalConfigs] = useState<ServiceConfig[]>(serviceConfigs)

  const now = new Date()
  const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const dayOfMonth = now.getDate()

  const mtd = usage.filter(r => r.period_start >= monthStart)
  const mtdTotal = mtd.reduce((s, r) => s + Number(r.cost_usd), 0)
  const dailyAvg = dayOfMonth > 0 ? mtdTotal / dayOfMonth : 0
  const projected = dailyAvg * daysInMonth

  const byService: Record<string, { cost: number; units: number; rows: UsageRow[]; lastActivity: string | null }> = {}
  for (const row of mtd) {
    if (!byService[row.service]) byService[row.service] = { cost: 0, units: 0, rows: [], lastActivity: null }
    byService[row.service].cost += Number(row.cost_usd)
    byService[row.service].units += Number(row.value ?? 0)
    byService[row.service].rows.push(row)
  }

  // Last activity per service across all 90 days
  const lastActivityByService: Record<string, string> = {}
  for (const row of usage) {
    const svc = row.service
    if (!lastActivityByService[svc] || row.period_start > lastActivityByService[svc]) {
      lastActivityByService[svc] = row.period_start
    }
  }

  const getServiceStatus = (svc: string): ServiceStatus => {
    return localConfigs.find(c => c.service === svc)?.status ?? 'active'
  }

  const isIdle = (svc: string): boolean => {
    const last = lastActivityByService[svc]
    if (!last) return serviceConfig[svc] ?? false // configured but never used
    return last < thirtyDaysAgo.toISOString().slice(0, 10)
  }

  const handleToggle = (svc: string, currentStatus: ServiceStatus) => {
    const next: ServiceStatus = currentStatus === 'active' ? 'paused' : 'active'
    setLocalConfigs(prev => {
      const existing = prev.find(c => c.service === svc)
      if (existing) return prev.map(c => c.service === svc ? { ...c, status: next } : c)
      return [...prev, { service: svc, status: next, last_activity_at: null }]
    })
    startToggle(async () => { await setServiceStatus(svc, next) })
  }

  const handleSyncAll = () => {
    setSyncResults(null)
    startSync(async () => {
      const results = await syncAllUsage()
      setSyncResults(results)
      setTimeout(() => setSyncResults(null), 8000)
    })
  }

  const handleDelete = (id: string) => {
    startDelete(async () => { await deleteUsageEntry(id) })
  }

  const isNotConfigured = (e: string) => e.toLowerCase().includes('not configured')

  return (
    <div className="mx-auto max-w-4xl px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/dashboard" className="text-xs uppercase tracking-wider text-gray-600 hover:text-gray-400 transition-colors">← Dashboard</Link>
          <h1 className="mt-2 text-2xl font-bold text-white">Cost & Usage</h1>
          <p className="mt-0.5 text-sm text-gray-500">{now.toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleSyncAll} disabled={syncing}
            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:border-gray-600 disabled:opacity-40 transition-colors">
            {syncing ? 'Syncing…' : '↻ Sync All'}
          </button>
          <button onClick={() => setAddingEntry(true)} disabled={addingEntry}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 transition-colors">
            + Add Entry
          </button>
        </div>
      </div>

      {/* Sync results */}
      {syncResults && (
        <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900/30 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-600 mb-2">Last Sync Results</p>
          <div className="flex flex-wrap gap-3">
            {syncResults.map(r => (
              <div key={r.service} className="flex items-center gap-1.5">
                <span className={`h-1.5 w-1.5 rounded-full ${
                  r.error === 'Paused'
                    ? 'bg-yellow-500'
                    : r.error && isNotConfigured(r.error)
                    ? 'bg-gray-500'
                    : r.error
                    ? 'bg-red-500'
                    : 'bg-green-500'
                }`} />
                <span className="text-xs text-gray-400 capitalize">{r.service}:</span>
                {r.error === 'Paused'
                  ? <span className="text-xs text-yellow-500">Paused</span>
                  : r.error && isNotConfigured(r.error)
                  ? <span className="text-xs text-gray-600">{r.error}</span>
                  : r.error
                  ? <span className="text-xs text-red-400">{r.error}</span>
                  : <span className="text-xs text-green-400">{r.synced} records</span>
                }
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'MTD Spend', value: fmtCost(mtdTotal), sub: `${dayOfMonth} days` },
          { label: 'Daily Average', value: fmtCost(dailyAvg), sub: 'per day' },
          { label: 'Projected', value: fmtCost(projected), sub: 'end of month' },
        ].map(c => (
          <div key={c.label} className="rounded-xl border border-gray-800 bg-gray-900/30 px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-600 mb-2">{c.label}</p>
            <p className="text-2xl font-bold text-white">{c.value}</p>
            <p className="text-xs text-gray-600 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-5 py-4 mb-6">
        <p className="text-xs font-medium uppercase tracking-wider text-gray-600 mb-3">Daily Spend — Last 30 Days</p>
        <SpendChart usage={usage} />
        <p className="text-xs text-gray-700 mt-1 text-right">Today highlighted in indigo</p>
      </div>

      {/* Combined services table */}
      <div className="rounded-xl border border-gray-800 overflow-hidden mb-6">
        <div className="border-b border-gray-800 bg-gray-900/50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Services · This Month</p>
          <p className="text-xs text-gray-600 mt-0.5">Pause a service to skip it during sync. Auto-logging always resumes when the service is used.</p>
        </div>
        {TRACKED_SERVICES.map(svc => {
          const meta = SERVICE_META[svc]
          const data = byService[svc]
          const configured = serviceConfig[svc] ?? false
          const status = getServiceStatus(svc)
          const idle = isIdle(svc)
          const lastSeen = lastActivityByService[svc]

          return (
            <div key={svc} className="flex items-center gap-4 px-4 py-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-900/20 transition-colors">
              <span className="text-lg w-6 shrink-0 text-center">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`text-sm font-medium ${meta.color}`}>{meta.label}</p>
                  {idle && status === 'active' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-900/40 text-yellow-500">Idle</span>
                  )}
                  {status === 'paused' && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">Paused</span>
                  )}
                </div>
                <p className="text-xs text-gray-700">{meta.pricingNote}</p>
                <p className="text-xs text-gray-700 mt-0.5">
                  {configured ? (
                    lastSeen
                      ? `Last activity ${fmtDate(lastSeen)}`
                      : 'Configured · no activity yet'
                  ) : (
                    <span className="text-yellow-700">API key not configured</span>
                  )}
                </p>
              </div>
              {data ? (
                <>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-white">{fmtCost(data.cost)}</p>
                    <p className="text-xs text-gray-600">{data.units > 0 ? `${data.units.toFixed(1)} ${meta.unitLabel}` : `${data.rows.length} entr${data.rows.length !== 1 ? 'ies' : 'y'}`}</p>
                  </div>
                  {mtdTotal > 0 && (
                    <div className="w-20 h-1.5 rounded-full bg-gray-800 shrink-0">
                      <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: `${Math.min((data.cost / Math.max(mtdTotal, 0.01)) * 100, 100)}%` }} />
                    </div>
                  )}
                </>
              ) : (
                <span className="text-xs text-gray-700 shrink-0 mr-1">No data</span>
              )}
              <button
                onClick={() => handleToggle(svc, status)}
                disabled={togglingService}
                className={`shrink-0 rounded-lg border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
                  status === 'active'
                    ? 'border-gray-700 text-gray-500 hover:border-yellow-700 hover:text-yellow-500'
                    : 'border-yellow-800 text-yellow-600 hover:border-green-700 hover:text-green-500'
                }`}
              >
                {status === 'active' ? 'Pause' : 'Resume'}
              </button>
            </div>
          )
        })}
        {byService['other'] && (() => {
          const svc = 'other'
          const meta = SERVICE_META[svc]
          const data = byService[svc]
          return (
            <div key={svc} className="flex items-center gap-4 px-4 py-3 border-b border-gray-800/50 last:border-0 hover:bg-gray-900/20 transition-colors">
              <span className="text-lg w-6 shrink-0 text-center">{meta.icon}</span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium ${meta.color}`}>{meta.label}</p>
                {meta.pricingNote && <p className="text-xs text-gray-700">{meta.pricingNote}</p>}
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-white">{fmtCost(data.cost)}</p>
                <p className="text-xs text-gray-600">{data.units > 0 ? `${data.units.toFixed(1)} ${meta.unitLabel}` : `${data.rows.length} entr${data.rows.length !== 1 ? 'ies' : 'y'}`}</p>
              </div>
              {mtdTotal > 0 && (
                <div className="w-20 h-1.5 rounded-full bg-gray-800 shrink-0">
                  <div className="h-1.5 rounded-full bg-indigo-600" style={{ width: `${Math.min((data.cost / Math.max(mtdTotal, 0.01)) * 100, 100)}%` }} />
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {/* Add entry form */}
      {addingEntry && <div className="mb-6"><AddEntryForm onDone={() => setAddingEntry(false)} /></div>}

      {/* Recent entries */}
      {usage.length > 0 && (
        <div className="rounded-xl border border-gray-800 overflow-hidden">
          <div className="border-b border-gray-800 bg-gray-900/50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500">Recent Entries (90 days)</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800/50">
                {['Date', 'Service', 'Type', 'Cost', 'Source', ''].map(h => (
                  <th key={h} className="px-4 py-2 text-left text-xs text-gray-600">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {usage.slice(0, 50).map((row: UsageRow) => {
                const meta = SERVICE_META[row.service] ?? SERVICE_META.other
                return (
                  <tr key={row.id} className="border-b border-gray-800/30 hover:bg-gray-900/20 transition-colors">
                    <td className="px-4 py-2 text-xs text-gray-500">{fmtDate(row.period_start)}</td>
                    <td className="px-4 py-2"><span className={`text-xs ${meta.color}`}>{meta.icon} {meta.label}</span></td>
                    <td className="px-4 py-2 text-xs text-gray-600">{row.metric_type}</td>
                    <td className="px-4 py-2 text-xs font-mono text-white">{fmtCost(Number(row.cost_usd))}</td>
                    <td className="px-4 py-2">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        row.source === 'manual' ? 'bg-gray-800 text-gray-500'
                        : row.source === 'auto' ? 'bg-indigo-900/40 text-indigo-400'
                        : 'bg-green-900/30 text-green-500'
                      }`}>{row.source}</span>
                    </td>
                    <td className="px-4 py-2">
                      {row.source === 'manual' && (
                        <button onClick={() => handleDelete(row.id)} disabled={deleting}
                          className="text-xs text-gray-700 hover:text-red-400 transition-colors">✕</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {usage.length === 0 && !addingEntry && (
        <div className="rounded-2xl border border-dashed border-gray-800 py-16 text-center">
          <p className="text-gray-500 mb-2">No usage data yet</p>
          <p className="text-xs text-gray-700 mb-4">Click Sync All to pull data from connected services, or add a manual entry</p>
          <div className="flex items-center justify-center gap-3">
            <button onClick={handleSyncAll} disabled={syncing}
              className="rounded-lg border border-gray-700 px-4 py-2 text-sm text-gray-400 hover:text-white hover:border-gray-600 transition-colors">
              {syncing ? 'Syncing…' : '↻ Sync All'}
            </button>
            <button onClick={() => setAddingEntry(true)}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 transition-colors">
              + Add Entry
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

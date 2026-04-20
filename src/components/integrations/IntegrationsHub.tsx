'use client'
import { useState, useTransition } from 'react'
import { triggerNotionSync } from '@/app/api/integrations/actions'
import type { IntegrationStatus } from '@/app/api/integrations/actions'

const CATEGORY_COLORS: Record<IntegrationStatus['category'], { border: string; dot: string; badge: string; text: string }> = {
  active:       { border: 'border-green-900/50',  dot: 'bg-green-500',  badge: 'bg-green-950/40 text-green-400 border-green-900/50',  text: 'text-green-400'  },
  configured:   { border: 'border-indigo-900/50', dot: 'bg-indigo-400', badge: 'bg-indigo-950/40 text-indigo-400 border-indigo-900/50', text: 'text-indigo-400' },
  disconnected: { border: 'border-gray-800',      dot: 'bg-gray-700',   badge: 'bg-gray-900 text-gray-600 border-gray-800',           text: 'text-gray-600'  },
}

const CATEGORY_LABELS: Record<IntegrationStatus['category'], string> = {
  active: 'Connected',
  configured: 'Configured',
  disconnected: 'Not connected',
}

function formatSync(iso: string | null | undefined): string {
  if (!iso) return 'Never synced'
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60_000)
  const diffHr = Math.floor(diffMs / 3_600_000)
  const diffDay = Math.floor(diffMs / 86_400_000)
  if (diffMin < 1) return 'Just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`
  if (diffDay === 1) return 'Yesterday'
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function IntegrationCard({ integration }: { integration: IntegrationStatus }) {
  const [syncing, startSync] = useTransition()
  const [synced, setSynced] = useState(false)
  const colors = CATEGORY_COLORS[integration.category]

  const handleSync = () => {
    startSync(async () => {
      await triggerNotionSync()
      setSynced(true)
    })
  }

  return (
    <div className={`rounded-xl border ${colors.border} bg-gray-900/30 p-5 flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-gray-300">{integration.icon}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{integration.name}</p>
            <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${colors.badge} mt-0.5`}>
              <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
              {CATEGORY_LABELS[integration.category]}
            </span>
          </div>
        </div>
      </div>

      {/* Description */}
      <p className="text-xs text-gray-500 leading-relaxed">{integration.description}</p>

      {/* Detail / last sync */}
      <div className="space-y-1">
        <p className={`text-xs ${colors.text}`}>{integration.detail}</p>
        {integration.lastSync !== undefined && (
          <p className="text-xs text-gray-600">Last synced: {formatSync(integration.lastSync)}</p>
        )}
      </div>

      {/* Action */}
      {integration.canSync && (
        <button
          onClick={handleSync}
          disabled={syncing}
          className="self-start rounded-md border border-gray-700 bg-gray-800/60 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white disabled:opacity-40 transition-colors"
        >
          {syncing ? 'Syncing…' : synced ? '✓ Synced' : '↻ Sync Now'}
        </button>
      )}
    </div>
  )
}

interface Props {
  integrations: IntegrationStatus[]
}

export function IntegrationsHub({ integrations }: Props) {
  const active = integrations.filter(i => i.category === 'active')
  const configured = integrations.filter(i => i.category === 'configured')
  const disconnected = integrations.filter(i => i.category === 'disconnected')

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage the services connected to your HQ workspace.
        </p>
      </div>

      {active.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Connected</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map(i => <IntegrationCard key={i.id} integration={i} />)}
          </div>
        </section>
      )}

      {configured.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Configured</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {configured.map(i => <IntegrationCard key={i.id} integration={i} />)}
          </div>
        </section>
      )}

      {disconnected.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-4">Not Connected</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {disconnected.map(i => <IntegrationCard key={i.id} integration={i} />)}
          </div>
        </section>
      )}

      {/* Health check note */}
      <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/20 px-4 py-3 flex items-center gap-3">
        <span className="text-xs text-gray-600">System health endpoint:</span>
        <code className="text-xs text-gray-400 font-mono">/api/health</code>
        <span className="text-xs text-gray-600">— returns DB connectivity status</span>
      </div>
    </div>
  )
}

'use client'
import { useState, useTransition } from 'react'
import { triggerNotionSync } from '@/app/api/integrations/actions'
import type { IntegrationStatus } from '@/app/api/integrations/actions'

const CATEGORY_COLORS: Record<IntegrationStatus['category'], { border: string; dot: string; badge: string; text: string }> = {
  active:       { border: 'border-green-200',  dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700 border-green-200',   text: 'text-green-700'  },
  configured:   { border: 'border-indigo-200', dot: 'bg-indigo-500', badge: 'bg-indigo-50 text-indigo-700 border-indigo-200', text: 'text-indigo-700' },
  error:        { border: 'border-red-200',    dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200',         text: 'text-red-700'   },
  disconnected: { border: 'border-gray-200',   dot: 'bg-gray-400',   badge: 'bg-gray-100 text-gray-500 border-gray-200',     text: 'text-gray-500'  },
}

const CATEGORY_LABELS: Record<IntegrationStatus['category'], string> = {
  active: 'Connected',
  configured: 'Configured',
  error: 'Error',
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
    <div className={`rounded-xl border ${colors.border} bg-white p-5 flex flex-col gap-3`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-gray-600">{integration.icon}</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{integration.name}</p>
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
        {integration.errorMessage && (
          <p className="text-xs text-red-600 font-mono break-all">{integration.errorMessage}</p>
        )}
        {integration.lastSync !== undefined && (
          <p className="text-xs text-gray-400">Last synced: {formatSync(integration.lastSync)}</p>
        )}
      </div>

      {/* Action */}
      {integration.canSync && (
        <button
          onClick={handleSync}
          disabled={syncing}
          className="self-start rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-40 transition-colors"
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
  const errored = integrations.filter(i => i.category === 'error')
  const disconnected = integrations.filter(i => i.category === 'disconnected')

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage the services connected to your HQ workspace.
        </p>
      </div>

      {errored.length > 0 && (
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-red-600 mb-4">Needs attention</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {errored.map(i => <IntegrationCard key={i.id} integration={i} />)}
          </div>
        </section>
      )}

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

    </div>
  )
}

'use client'
import { useState, useEffect } from 'react'
import { AgentPanel } from '@/components/agent/AgentPanel'

interface Props {
  children: React.ReactNode
  nav: React.ReactNode
}

export function DashboardShell({ children, nav }: Props) {
  const [agentOpen, setAgentOpen] = useState(false)
  const [starter, setStarter] = useState<string | null>(null)

  useEffect(() => {
    function onOpen(e: Event) {
      const detail = (e as CustomEvent).detail as { starter?: string } | undefined
      if (detail?.starter) setStarter(detail.starter)
      setAgentOpen(true)
    }
    window.addEventListener('hq-agent:open', onOpen as EventListener)
    return () => window.removeEventListener('hq-agent:open', onOpen as EventListener)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div id="dashboard-shell" data-agent-open={agentOpen ? 'true' : 'false'}>
        {nav}
        <main className="pt-16">{children}</main>
        <AgentPanel
          open={agentOpen}
          starter={starter}
          onConsumedStarter={() => setStarter(null)}
          onClose={() => { setAgentOpen(false); setStarter(null) }}
        />
        {!agentOpen && (
          <button
            onClick={() => setAgentOpen(true)}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-indigo-500 transition-colors"
          >
            <span className="text-base leading-none">✦</span>
            <span>HQ Agent</span>
          </button>
        )}
      </div>
    </div>
  )
}

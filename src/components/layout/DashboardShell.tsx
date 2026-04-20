'use client'
import { useState } from 'react'
import { AgentPanel } from '@/components/agent/AgentPanel'

interface Props {
  children: React.ReactNode
  nav: React.ReactNode
}

export function DashboardShell({ children, nav }: Props) {
  const [agentOpen, setAgentOpen] = useState(false)

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Pass toggle fn down via a custom event so nav button can trigger it */}
      <div id="dashboard-shell" data-agent-open={agentOpen ? 'true' : 'false'}>
        {nav}
        <main className="pt-16">{children}</main>
        <AgentPanel open={agentOpen} onClose={() => setAgentOpen(false)} />
        {/* Floating agent button (visible when panel is closed) */}
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

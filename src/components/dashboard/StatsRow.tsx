'use client'
interface Stats { openWorkOrders: number; unreviewedIdeas: number }

export function StatsRow({ stats }: { stats: Stats }) {
  const items = [
    { label: 'Open Work Orders', value: stats.openWorkOrders, icon: '🔧', href: '/dashboard/work-orders', urgent: stats.openWorkOrders > 5 },
    { label: 'Unreviewed Ideas', value: stats.unreviewedIdeas, icon: '💡', href: '/dashboard/ideas', urgent: false },
    { label: 'Today', value: new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }), icon: '📅', href: null, urgent: false, isString: true },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <div key={item.label}
          className={`rounded-xl border p-4 transition-colors ${item.urgent ? 'border-amber-500/40 bg-amber-950/30' : 'border-gray-800 bg-gray-900/60'} ${item.href ? 'cursor-pointer hover:border-gray-700' : ''}`}
          onClick={() => item.href && (window.location.href = item.href)}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">{item.icon}</span>
            <span className="text-xs text-gray-500 font-medium">{item.label}</span>
          </div>
          {'isString' in item && item.isString
            ? <p className="text-sm font-semibold text-white">{item.value}</p>
            : <p className={`text-3xl font-bold tabular-nums ${item.urgent ? 'text-amber-400' : 'text-white'}`}>{item.value}</p>
          }
        </div>
      ))}
    </div>
  )
}

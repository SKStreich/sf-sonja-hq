interface Capture { id: string; type: 'idea' | 'task'; content: string; entity_context: string | null; created_at: string; reviewed: boolean }

const TYPE_CONFIG = {
  idea: { label: 'Idea', icon: '💡', color: 'text-violet-400 bg-violet-950/50 border-violet-800/60' },
  task: { label: 'Task', icon: '✅', color: 'text-sky-400 bg-sky-950/50 border-sky-800/60' },
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function PriorityFeed({ captures }: { captures: Capture[] }) {
  if (captures.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center">
        <p className="text-2xl mb-2">🫙</p>
        <p className="text-gray-500 text-sm">No captures yet — use Quick Capture to log ideas and tasks.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {captures.map((capture) => {
        const config = TYPE_CONFIG[capture.type] ?? TYPE_CONFIG.idea
        return (
          <div key={capture.id} className="group flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900/40 px-4 py-3 hover:border-gray-700 hover:bg-gray-900/70 transition-all cursor-pointer">
            <span className={`mt-0.5 shrink-0 rounded-md border px-2 py-0.5 text-xs font-semibold ${config.color}`}>
              {config.icon} {config.label}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-white leading-snug truncate">{capture.content}</p>
              {capture.entity_context && <p className="mt-0.5 text-xs text-gray-500 truncate">re: {capture.entity_context}</p>}
            </div>
            <span className="shrink-0 text-xs text-gray-600 group-hover:text-gray-500 transition-colors pt-0.5">{timeAgo(capture.created_at)}</span>
          </div>
        )
      })}
    </div>
  )
}

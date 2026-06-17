import type { TaskProgress } from '@/lib/projects/progress'

interface Props {
  progress: TaskProgress
  /** Show the "done/total tasks" caption under the bar. */
  showCaption?: boolean
  className?: string
}

/** Thin completion bar driven by done ÷ (total − cancelled). */
export function ProjectProgress({ progress, showCaption = false, className = '' }: Props) {
  const { done, total, pct } = progress

  if (total === 0) {
    return <p className={`text-xs text-gray-400 ${className}`}>No tasks yet</p>
  }

  const barColor = pct === 100 ? 'bg-green-500' : 'bg-indigo-500'

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
          <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <span className="shrink-0 text-xs font-medium tabular-nums text-gray-500">{pct}%</span>
      </div>
      {showCaption && (
        <p className="mt-1 text-xs text-gray-400">{done} of {total} task{total !== 1 ? 's' : ''} done</p>
      )}
    </div>
  )
}

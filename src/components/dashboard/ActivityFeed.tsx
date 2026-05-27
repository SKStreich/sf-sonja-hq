'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { loadMoreActivity } from '@/app/dashboard/actions'
import { renderFieldChange, type ActivityRow } from '@/lib/activity-feed'

type Filter = 'all' | 'changes' | 'updates'

interface Props {
  initialRows: ActivityRow[]
  initialNextCursor: string | null
}

function relativeTime(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay === 1) return 'yesterday'
  return `${diffDay}d`
}

const UPDATE_SUBTYPE_BORDER: Record<string, string> = {
  progress: 'border-blue-400',
  blocker: 'border-red-500',
  decision: 'border-purple-500',
  note: 'border-gray-300',
  milestone: 'border-green-500',
}

export function ActivityFeed({ initialRows, initialNextCursor }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const filterParam = (searchParams.get('activity') as Filter) ?? 'all'
  const filter: Filter = ['all', 'changes', 'updates'].includes(filterParam) ? filterParam : 'all'

  const [rows, setRows] = useState<ActivityRow[]>(initialRows)
  const [cursor, setCursor] = useState<string | null>(initialNextCursor)
  const [isPending, startTransition] = useTransition()

  function setFilter(next: Filter) {
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'all') params.delete('activity')
    else params.set('activity', next)
    router.replace(`/dashboard${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false })
  }

  function loadMore() {
    if (!cursor) return
    startTransition(async () => {
      const { rows: newRows, nextCursor } = await loadMoreActivity(cursor)
      setRows((prev) => [...prev, ...newRows])
      setCursor(nextCursor)
    })
  }

  const visible = rows.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'changes') return r.activity_type === 'field_change'
    if (filter === 'updates') return r.activity_type === 'project_update'
    return true
  })

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Recent Activity</h2>
        <div className="flex gap-1 text-xs">
          {(['all', 'changes', 'updates'] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-full px-2 py-0.5 font-mono uppercase tracking-wider ${
                filter === f
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-500">No recent activity</p>
      ) : (
        <ul className="space-y-3">
          {visible.map((row) => (
            <li key={`${row.activity_type}-${row.id}`} className="flex gap-2">
              <span
                className={`inline-block self-start rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                  row.activity_type === 'field_change'
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-blue-50 text-blue-700'
                }`}
              >
                {row.activity_type === 'field_change' ? 'change' : 'update'}
              </span>

              <div className="min-w-0 flex-1">
                {row.activity_type === 'field_change' ? (
                  <p className="text-sm text-gray-700">{renderFieldChange(row)}</p>
                ) : (
                  <UpdateRow row={row} />
                )}
                <div className="mt-0.5 flex items-center gap-2">
                  {row.entity_type === 'task' && row.task_project_id && (
                    <Link
                      href={`/dashboard/projects/${row.task_project_id}`}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      {row.task_project_name}
                    </Link>
                  )}
                  {row.entity_type === 'project' && row.entity_name && (
                    <Link
                      href={`/dashboard/projects/${row.entity_id}`}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      {row.entity_name}
                    </Link>
                  )}
                  <span className="text-xs text-gray-400">{relativeTime(row.occurred_at)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <div className="mt-4 border-t border-gray-100 pt-3 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={isPending}
            className="text-xs text-gray-500 hover:text-gray-800 disabled:opacity-50"
          >
            {isPending ? 'Loading…' : 'Show more →'}
          </button>
        </div>
      )}
    </section>
  )
}

function UpdateRow({ row }: { row: ActivityRow }) {
  const border = UPDATE_SUBTYPE_BORDER[row.update_subtype ?? 'note'] ?? UPDATE_SUBTYPE_BORDER.note
  const truncated =
    (row.update_content?.length ?? 0) > 100
      ? row.update_content!.slice(0, 100) + '…'
      : row.update_content
  return (
    <div className={`border-l-2 pl-2 ${border}`}>
      <p className="text-sm text-gray-700">
        <strong>{row.actor_name ?? '(System)'}</strong>
        {row.update_subtype && row.update_subtype !== 'note' && (
          <span className="text-gray-500"> · {row.update_subtype}</span>
        )}
        {truncated && <span>: {truncated}</span>}
      </p>
    </div>
  )
}

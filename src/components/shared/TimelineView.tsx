'use client'
import Link from 'next/link'
import { useMemo } from 'react'

export interface TimelineItem {
  id: string
  name: string
  startDate?: string | null  // YYYY-MM-DD
  endDate?: string | null    // YYYY-MM-DD
  entityType?: string
  entityName?: string
  href?: string
}

const ENTITY_BAR: Record<string, string> = {
  tm: 'bg-blue-500',
  sf: 'bg-indigo-500',
  sfe: 'bg-purple-500',
  personal: 'bg-green-500',
}

const ENTITY_TEXT: Record<string, string> = {
  tm: 'text-blue-400',
  sf: 'text-indigo-400',
  sfe: 'text-purple-400',
  personal: 'text-green-400',
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

interface Props {
  items: TimelineItem[]
  monthsBefore?: number
  monthsAfter?: number
  emptyLabel?: string
}

export function TimelineView({ items, monthsBefore = 1, monthsAfter = 5, emptyLabel }: Props) {
  const today = useMemo(() => new Date(), [])
  const windowStart = useMemo(() => startOfMonth(addMonths(today, -monthsBefore)), [today, monthsBefore])
  const windowEnd = useMemo(() => startOfMonth(addMonths(today, monthsAfter + 1)), [today, monthsAfter])
  const totalMs = windowEnd.getTime() - windowStart.getTime()

  const months = useMemo(() => {
    const result: Date[] = []
    let m = new Date(windowStart)
    while (m < windowEnd) {
      result.push(new Date(m))
      m = addMonths(m, 1)
    }
    return result
  }, [windowStart, windowEnd])

  const todayPct = Math.max(0, Math.min(100, ((today.getTime() - windowStart.getTime()) / totalMs) * 100))

  const rows = useMemo(() => items.map(item => {
    const rawStart = item.startDate ? new Date(item.startDate + 'T00:00:00') : today
    const rawEnd = item.endDate ? new Date(item.endDate + 'T23:59:59') : null

    const startMs = Math.max(rawStart.getTime(), windowStart.getTime())
    const endMs = rawEnd ? Math.min(rawEnd.getTime(), windowEnd.getTime()) : null

    const leftPct = Math.max(0, ((startMs - windowStart.getTime()) / totalMs) * 100)
    const widthPct = endMs ? Math.max(0.8, ((endMs - startMs) / totalMs) * 100) : 0
    const isOverdue = rawEnd && rawEnd < today

    return { ...item, leftPct, widthPct, hasEnd: !!(endMs && rawEnd), isOverdue }
  }), [items, windowStart, windowEnd, totalMs, today])

  return (
    <div className="rounded-xl border border-gray-800 overflow-hidden">
      {/* Month headers */}
      <div className="relative flex border-b border-gray-800 bg-gray-900/60">
        <div className="w-36 shrink-0 px-3 py-2 border-r border-gray-800" />
        <div className="flex-1 relative flex">
          {months.map((m, i) => (
            <div key={i} className="flex-1 px-2 py-2 border-r border-gray-800/40 last:border-0">
              <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                {m.toLocaleDateString('en-US', { month: 'short' })}
                {' '}
                <span className="font-normal text-gray-600">'{m.toLocaleDateString('en-US', { year: '2-digit' })}</span>
              </span>
            </div>
          ))}
          {/* Today marker in header */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-indigo-500/70 pointer-events-none"
            style={{ left: `${todayPct}%` }}
          />
        </div>
      </div>

      {/* Empty state */}
      {rows.length === 0 && (
        <div className="py-10 text-center text-sm text-gray-500">{emptyLabel ?? 'No items to display'}</div>
      )}

      {/* Item rows */}
      {rows.map(row => {
        const barColor = row.isOverdue
          ? 'bg-red-500'
          : (ENTITY_BAR[row.entityType ?? ''] ?? 'bg-gray-600')

        const inner = (
          <div className="flex items-stretch border-b border-gray-800/30 last:border-0 hover:bg-gray-900/40 transition-colors group cursor-pointer">
            {/* Name column */}
            <div className="w-36 shrink-0 px-3 py-2.5 border-r border-gray-800/40 flex flex-col justify-center">
              <p className="text-xs text-gray-300 truncate group-hover:text-white leading-tight">{row.name}</p>
              {row.entityName && (
                <p className={`text-[10px] mt-0.5 truncate ${ENTITY_TEXT[row.entityType ?? ''] ?? 'text-gray-600'}`}>
                  {row.entityName}
                </p>
              )}
            </div>
            {/* Timeline area */}
            <div className="flex-1 relative h-10 overflow-hidden">
              {/* Month grid lines */}
              {months.map((_, i) => (
                <div key={i} className="absolute top-0 bottom-0 w-px bg-gray-800/30 pointer-events-none"
                  style={{ left: `${(i / months.length) * 100}%` }} />
              ))}
              {/* Today line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-indigo-500/30 pointer-events-none"
                style={{ left: `${todayPct}%` }}
              />
              {/* Bar or dot */}
              {row.hasEnd ? (
                <div
                  className={`absolute top-1/2 -translate-y-1/2 h-4 rounded-full ${barColor} opacity-80 group-hover:opacity-100 transition-opacity min-w-[6px]`}
                  style={{ left: `${row.leftPct}%`, width: `${row.widthPct}%` }}
                  title={row.endDate ? `Due ${row.endDate}` : undefined}
                />
              ) : (
                <div
                  className={`absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 ${barColor.replace('bg-', 'border-')} bg-transparent opacity-80 group-hover:opacity-100 transition-opacity`}
                  style={{ left: `calc(${row.leftPct}% - 6px)` }}
                  title="No due date set"
                />
              )}
            </div>
          </div>
        )

        return row.href ? (
          <Link key={row.id} href={row.href} className="block">{inner}</Link>
        ) : (
          <div key={row.id}>{inner}</div>
        )
      })}
    </div>
  )
}

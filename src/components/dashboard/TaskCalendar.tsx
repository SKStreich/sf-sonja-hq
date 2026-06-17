'use client'
import { useMemo, useState } from 'react'
import Link from 'next/link'

export interface CalendarEvent {
  id: string
  title: string
  /** YYYY-MM-DD */
  date: string
  type: 'task' | 'project'
  status?: string | null
  priority?: string | null
  /** e.g. the project name for a task. */
  subtitle?: string | null
  href: string
}

type ViewMode = 'week' | 'month' | 'year'

// ── Date helpers (all local-time; events are plain YYYY-MM-DD) ────────────────

function ymd(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function addMonths(d: Date, n: number): Date { const x = new Date(d); x.setMonth(x.getMonth() + n); return x }
function addYears(d: Date, n: number): Date { const x = new Date(d); x.setFullYear(x.getFullYear() + n); return x }
function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
function startOfWeek(d: Date): Date { return addDays(d, -d.getDay()) } // Sunday-based

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function eventDotClass(e: CalendarEvent): string {
  if (e.type === 'project') return 'bg-violet-500'
  if (e.status === 'done') return 'bg-green-500'
  if (e.priority === 'high') return 'bg-red-500'
  if (e.priority === 'medium') return 'bg-orange-400'
  return 'bg-gray-400'
}

interface Props {
  events: CalendarEvent[]
}

export function TaskCalendar({ events }: Props) {
  const today = useMemo(() => new Date(), [])
  const todayStr = ymd(today)
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState<Date>(startOfMonth(today))

  // Bucket events by day for O(1) lookup.
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      if (!e.date) continue
      const arr = m.get(e.date) ?? []
      arr.push(e)
      m.set(e.date, arr)
    }
    return m
  }, [events])

  const upcoming = useMemo(() => {
    return [...events]
      .filter(e => e.date >= todayStr && e.status !== 'done' && e.status !== 'cancelled')
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .slice(0, 3)
  }, [events, todayStr])

  const periodLabel = useMemo(() => {
    if (view === 'year') return `${cursor.getFullYear()}`
    if (view === 'week') {
      const s = startOfWeek(cursor)
      const e = addDays(s, 6)
      const sameMonth = s.getMonth() === e.getMonth()
      const sFmt = s.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      const eFmt = e.toLocaleDateString('en-US', sameMonth ? { day: 'numeric' } : { month: 'short', day: 'numeric' })
      return `${sFmt} – ${eFmt}`
    }
    return cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }, [view, cursor])

  const step = (dir: 1 | -1) => {
    setCursor(c => view === 'year' ? addYears(c, dir) : view === 'week' ? addDays(c, dir * 7) : addMonths(c, dir))
  }
  const goToday = () => setCursor(view === 'week' ? today : startOfMonth(today))

  const btnCls = (active: boolean) =>
    `rounded-md px-2 py-1 text-xs font-medium transition-colors ${active ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      {/* Header / expand toggle */}
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-500">Calendar</h2>
          {events.length > 0 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-600">{events.length}</span>
          )}
        </div>
        <span className="text-xs text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {/* Collapsed teaser — next few items */}
      {!open && (
        <div className="mt-3">
          {upcoming.length === 0 ? (
            <p className="py-2 text-center text-sm text-gray-500">Nothing scheduled 🎉</p>
          ) : (
            <ul className="space-y-1.5">
              {upcoming.map(e => (
                <li key={e.id} className="flex items-center gap-2">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${eventDotClass(e)}`} />
                  <Link href={e.href} className="flex-1 truncate text-sm text-gray-700 hover:text-gray-900">{e.title}</Link>
                  <span className="shrink-0 text-xs text-gray-400">
                    {new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Expanded calendar */}
      {open && (
        <div className="mt-3">
          {/* Controls */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button onClick={() => step(-1)} className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100" aria-label="Previous">‹</button>
              <span className="min-w-[7rem] text-center text-sm font-semibold text-gray-800">{periodLabel}</span>
              <button onClick={() => step(1)} className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100" aria-label="Next">›</button>
              <button onClick={goToday} className="ml-1 rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100">Today</button>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-gray-200 p-0.5">
              <button className={btnCls(view === 'week')} onClick={() => setView('week')}>Week</button>
              <button className={btnCls(view === 'month')} onClick={() => setView('month')}>Month</button>
              <button className={btnCls(view === 'year')} onClick={() => setView('year')}>Year</button>
            </div>
          </div>

          {view === 'month' && <MonthGrid cursor={cursor} byDay={byDay} todayStr={todayStr} />}
          {view === 'week' && <WeekList cursor={cursor} byDay={byDay} todayStr={todayStr} />}
          {view === 'year' && (
            <YearGrid cursor={cursor} byDay={byDay} todayStr={todayStr}
              onPickMonth={(d) => { setCursor(startOfMonth(d)); setView('month') }} />
          )}

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-2 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-violet-500" /> Project due</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> High</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-orange-400" /> Medium</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> Done</span>
          </div>
        </div>
      )}
    </section>
  )
}

// ── Month grid ────────────────────────────────────────────────────────────────

function MonthGrid({ cursor, byDay, todayStr }: { cursor: Date; byDay: Map<string, CalendarEvent[]>; todayStr: string }) {
  const first = startOfMonth(cursor)
  const lead = first.getDay() // empty cells before day 1
  const cells: (Date | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(cursor.getFullYear(), cursor.getMonth(), d))
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div>
      <div className="grid grid-cols-7 gap-px">
        {WEEKDAYS.map((w, i) => (
          <div key={i} className="pb-1 text-center text-[10px] font-semibold uppercase text-gray-400">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px rounded-lg bg-gray-100 p-px">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[3.25rem] rounded bg-white" />
          const key = ymd(d)
          const evts = byDay.get(key) ?? []
          const isToday = key === todayStr
          return (
            <div key={i} className="min-h-[3.25rem] rounded bg-white p-1">
              <div className={`mb-0.5 text-right text-[10px] ${isToday ? 'font-bold text-indigo-600' : 'text-gray-400'}`}>
                {isToday ? <span className="rounded-full bg-indigo-600 px-1.5 py-0.5 text-white">{d.getDate()}</span> : d.getDate()}
              </div>
              <div className="space-y-0.5">
                {evts.slice(0, 2).map(e => (
                  <Link key={e.id} href={e.href} title={e.title}
                    className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-gray-50">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${eventDotClass(e)}`} />
                    <span className={`truncate text-[10px] ${e.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-600'}`}>{e.title}</span>
                  </Link>
                ))}
                {evts.length > 2 && <p className="px-1 text-[10px] text-gray-400">+{evts.length - 2} more</p>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Week list ─────────────────────────────────────────────────────────────────

function WeekList({ cursor, byDay, todayStr }: { cursor: Date; byDay: Map<string, CalendarEvent[]>; todayStr: string }) {
  const start = startOfWeek(cursor)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  return (
    <div className="space-y-1">
      {days.map((d, i) => {
        const key = ymd(d)
        const evts = byDay.get(key) ?? []
        const isToday = key === todayStr
        return (
          <div key={i} className={`flex gap-3 rounded-lg border p-2 ${isToday ? 'border-indigo-200 bg-indigo-50/40' : 'border-gray-100'}`}>
            <div className="w-12 shrink-0 text-center">
              <p className="text-[10px] uppercase text-gray-400">{d.toLocaleDateString('en-US', { weekday: 'short' })}</p>
              <p className={`text-sm font-semibold ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>{d.getDate()}</p>
            </div>
            <div className="min-w-0 flex-1">
              {evts.length === 0 ? (
                <p className="py-1 text-xs text-gray-300">—</p>
              ) : (
                <ul className="space-y-1">
                  {evts.map(e => (
                    <li key={e.id} className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${eventDotClass(e)}`} />
                      <Link href={e.href} className={`flex-1 truncate text-sm hover:text-gray-900 ${e.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                        {e.title}
                      </Link>
                      {e.subtitle && <span className="shrink-0 truncate text-xs text-gray-400 max-w-[8rem]">{e.subtitle}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Year grid (12 mini-months) ──────────────────────────────────────────────────

function YearGrid({ cursor, byDay, todayStr, onPickMonth }: {
  cursor: Date
  byDay: Map<string, CalendarEvent[]>
  todayStr: string
  onPickMonth: (d: Date) => void
}) {
  const year = cursor.getFullYear()
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {Array.from({ length: 12 }, (_, month) => {
        const first = new Date(year, month, 1)
        const lead = first.getDay()
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        const cells: (number | null)[] = []
        for (let i = 0; i < lead; i++) cells.push(null)
        for (let d = 1; d <= daysInMonth; d++) cells.push(d)
        return (
          <button key={month} onClick={() => onPickMonth(first)}
            className="rounded-lg border border-gray-100 p-2 text-left hover:border-indigo-200 hover:bg-gray-50">
            <p className="mb-1 text-xs font-semibold text-gray-700">{first.toLocaleDateString('en-US', { month: 'short' })}</p>
            <div className="grid grid-cols-7 gap-px">
              {cells.map((d, i) => {
                if (!d) return <span key={i} className="h-3" />
                const key = ymd(new Date(year, month, d))
                const has = byDay.has(key)
                const isToday = key === todayStr
                return (
                  <span key={i}
                    className={`flex h-3 w-3 items-center justify-center text-[7px] ${
                      isToday ? 'rounded-full bg-indigo-600 text-white' : has ? 'rounded-full bg-indigo-100 text-indigo-700' : 'text-gray-300'
                    }`}>
                    {d}
                  </span>
                )
              })}
            </div>
          </button>
        )
      })}
    </div>
  )
}

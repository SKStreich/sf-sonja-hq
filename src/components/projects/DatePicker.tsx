'use client'
import { useState, useRef, useEffect } from 'react'
import { DayPicker, getDefaultClassNames } from 'react-day-picker'
import 'react-day-picker/style.css'

// react-day-picker v9's `classNames` prop replaces defaults rather than
// merging. The defaults include the grid layout (rdp-week, rdp-day) — if we
// override `day` without keeping `rdp-day`, the day cells collapse into a
// single column. Append our Tailwind classes to the defaults so the layout
// rules from `react-day-picker/style.css` still apply.
const rdpDefaults = getDefaultClassNames()

interface Props {
  value: string   // YYYY-MM-DD or ''
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date', className }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // Parse without timezone shift
  const selected = value ? new Date(value + 'T12:00:00') : undefined

  const handleSelect = (day: Date | undefined) => {
    if (day) {
      const y = day.getFullYear()
      const m = String(day.getMonth() + 1).padStart(2, '0')
      const d = String(day.getDate()).padStart(2, '0')
      onChange(`${y}-${m}-${d}`)
    } else {
      onChange('')
    }
    setOpen(false)
  }

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const display = selected
    ? selected.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : ''

  const baseInputCls = className ?? 'w-full rounded-lg bg-white px-3 py-2 text-sm ring-1 ring-gray-200 focus:ring-indigo-400 outline-none transition-all'

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`${baseInputCls} flex items-center justify-between gap-2 text-left`}>
        <span className={display ? 'text-gray-900' : 'text-gray-400'}>{display || placeholder}</span>
        <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 rounded-xl border border-gray-200 bg-white p-3 shadow-2xl text-gray-900">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={handleSelect}
            classNames={{
              month_caption: `${rdpDefaults.month_caption} flex justify-center items-center h-9 mb-1 text-sm font-semibold text-gray-900`,
              caption_label: `${rdpDefaults.caption_label} text-sm font-semibold text-gray-900`,
              nav: `${rdpDefaults.nav} flex items-center justify-between absolute top-0 inset-x-0 px-1`,
              button_previous: `${rdpDefaults.button_previous} h-7 w-7 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 flex items-center justify-center`,
              button_next: `${rdpDefaults.button_next} h-7 w-7 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100 flex items-center justify-center`,
              weekday: `${rdpDefaults.weekday} text-[11px] uppercase tracking-wider text-gray-400 font-medium pb-1`,
              day: `${rdpDefaults.day} text-sm text-gray-700 rounded-md hover:bg-indigo-50 hover:text-indigo-700 cursor-pointer transition-colors`,
              today: `${rdpDefaults.today} font-semibold text-indigo-600`,
              selected: `${rdpDefaults.selected} bg-indigo-600 text-white hover:bg-indigo-600 hover:text-white`,
              outside: `${rdpDefaults.outside} text-gray-300`,
              disabled: `${rdpDefaults.disabled} text-gray-300 cursor-not-allowed`,
            }}
          />
          {value && (
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              className="mt-1 w-full text-center text-xs text-gray-500 hover:text-gray-700 transition-colors py-1">
              Clear date
            </button>
          )}
        </div>
      )}
    </div>
  )
}

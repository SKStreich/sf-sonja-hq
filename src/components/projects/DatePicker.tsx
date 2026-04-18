'use client'
import { useState, useRef, useEffect } from 'react'
import { DayPicker } from 'react-day-picker'
import 'react-day-picker/style.css'

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

  const baseInputCls = className ?? 'w-full rounded-lg bg-gray-950 px-3 py-2 text-sm ring-1 ring-gray-700 focus:ring-indigo-500 outline-none transition-all'

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className={`${baseInputCls} flex items-center justify-between gap-2 text-left`}>
        <span className={display ? 'text-white' : 'text-gray-600'}>{display || placeholder}</span>
        <svg className="w-3.5 h-3.5 text-gray-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
      {open && (
        <div className="absolute top-full left-0 z-50 mt-1 rounded-xl border border-gray-700 bg-gray-900 p-3 shadow-2xl">
          <DayPicker mode="single" selected={selected} onSelect={handleSelect} />
          {value && (
            <button type="button" onClick={() => { onChange(''); setOpen(false) }}
              className="mt-1 w-full text-center text-xs text-gray-600 hover:text-gray-400 transition-colors py-1">
              Clear date
            </button>
          )}
        </div>
      )}
    </div>
  )
}

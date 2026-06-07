'use client'
/**
 * Multi-select entity ("personality") picker — toggle chips. A knowledge entry
 * can belong to more than one entity (Sprint 12 multi-entity, PR 2b). At least
 * one must stay selected; the component enforces that by refusing to deselect
 * the last chip (the server also guards, OQ2='app').
 */

import { ENTITY_TOGGLE_CLASS, type EntitySlug } from '@/lib/entities/config'

const FALLBACK = { on: 'bg-gray-700 text-white border-gray-700', off: 'bg-gray-50 text-gray-700 border-gray-200' }

interface Option { value: string; label: string }

interface Props {
  options: Option[]
  selected: string[]
  onChange: (next: string[]) => void
  className?: string
}

export function EntityMultiSelect({ options, selected, onChange, className = '' }: Props) {
  const toggle = (value: string) => {
    if (selected.includes(value)) {
      if (selected.length === 1) return // keep ≥1 selected
      onChange(selected.filter(v => v !== value))
    } else {
      onChange([...selected, value])
    }
  }
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`}>
      {options.map(opt => {
        const isOn = selected.includes(opt.value)
        const style = ENTITY_TOGGLE_CLASS[opt.value as EntitySlug] ?? FALLBACK
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={isOn}
            onClick={() => toggle(opt.value)}
            className={`rounded border px-2 py-0.5 text-xs font-medium uppercase tracking-wide transition-colors ${isOn ? style.on : style.off}`}
          >
            {opt.label}
          </button>
        )
      })}
    </span>
  )
}

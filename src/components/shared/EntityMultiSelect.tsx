'use client'
/**
 * Multi-select entity ("personality") picker — toggle chips. A knowledge entry
 * can belong to more than one entity (Sprint 12 multi-entity, PR 2b). At least
 * one must stay selected; the component enforces that by refusing to deselect
 * the last chip (the server also guards, OQ2='app').
 */

const ENTITY_STYLES: Record<string, { on: string; off: string }> = {
  tm: { on: 'bg-emerald-600 text-white border-emerald-600', off: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  sf: { on: 'bg-indigo-600 text-white border-indigo-600', off: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  sfe: { on: 'bg-fuchsia-600 text-white border-fuchsia-600', off: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
  sfc: { on: 'bg-cyan-600 text-white border-cyan-600', off: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  personal: { on: 'bg-gray-700 text-white border-gray-700', off: 'bg-gray-50 text-gray-700 border-gray-200' },
}

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
        const style = ENTITY_STYLES[opt.value] ?? ENTITY_STYLES.personal
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

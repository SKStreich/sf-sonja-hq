'use client'
/**
 * Multi-select Area picker (Sprint 13 A2) — toggle chips, grouped by entity.
 * Areas are OPTIONAL (zero is fine), so unlike EntityMultiSelect there's no
 * "keep ≥1" rule. The caller passes only the areas in scope — i.e. those whose
 * entity is one of the item's entities (D6) — so the picker can't offer an area
 * that doesn't belong.
 */
import { groupAreasByEntity, type Area } from '@/lib/areas/areas'
import { ENTITY_META, type EntitySlug } from '@/lib/entities/config'

interface Props {
  /** Areas available for the item's entities (already scoped by the caller). */
  available: Area[]
  /** Selected area ids. */
  selected: string[]
  onChange: (next: string[]) => void
  className?: string
}

export function AreaMultiSelect({ available, selected, onChange, className = '' }: Props) {
  if (available.length === 0) {
    return <p className={`text-xs text-gray-400 ${className}`}>No areas for the selected entities yet — add some in Settings → Areas.</p>
  }
  const grouped = groupAreasByEntity(available)
  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(v => v !== id) : [...selected, id])
  }
  // Show groups in canonical entity order.
  const entities = Object.keys(grouped).sort(
    (a, b) => (ENTITY_META[a as EntitySlug] ? 0 : 1) - (ENTITY_META[b as EntitySlug] ? 0 : 1),
  )
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {entities.map(entity => (
        <div key={entity} className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            {ENTITY_META[entity as EntitySlug]?.label ?? entity}
          </span>
          {grouped[entity].map(a => {
            const isOn = selected.includes(a.id)
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={isOn}
                onClick={() => toggle(a.id)}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  isOn ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {a.name}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}

/**
 * Renders a SET of entity "personality" chips for a knowledge entry.
 *
 * A knowledge entry can belong to more than one entity (Sprint 12 multi-entity).
 * Pass the full slug set (`entry.entities`); falls back gracefully to a single
 * chip. Slugs are the TEXT enum values tm/sf/sfe/sfc/personal.
 */

const ENTITY_STYLES: Record<string, string> = {
  tm: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  sf: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  sfe: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
  sfc: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  personal: 'bg-gray-50 text-gray-700 border-gray-200',
}

interface Props {
  entities: string[]
  /** Visual size. 'badge' = uppercase pill (cards); 'plain' = compact (tables). */
  variant?: 'badge' | 'plain'
  className?: string
}

export function EntityChips({ entities, variant = 'badge', className = '' }: Props) {
  const slugs = entities.length > 0 ? entities : ['personal']
  if (variant === 'plain') {
    return (
      <span className={`inline-flex flex-wrap gap-1 ${className}`}>
        {slugs.map(s => (
          <span key={s} className="text-xs uppercase tracking-wide text-gray-600">
            {s}
          </span>
        ))}
      </span>
    )
  }
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {slugs.map(s => (
        <span
          key={s}
          className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${ENTITY_STYLES[s] ?? ENTITY_STYLES.personal}`}
        >
          {s}
        </span>
      ))}
    </span>
  )
}

/**
 * Renders a SET of entity "personality" chips for a knowledge entry.
 *
 * A knowledge entry can belong to more than one entity (Sprint 12 multi-entity).
 * Pass the full slug set (`entry.entities`); falls back gracefully to a single
 * chip. Slugs are the TEXT enum values tm/sf/sfe/sfc/personal.
 */

import { ENTITY_BADGE_CLASS, entityShort, type EntitySlug } from '@/lib/entities/config'

const FALLBACK = 'bg-gray-50 text-gray-700 border-gray-200'

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
            {entityShort(s)}
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
          className={`rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${ENTITY_BADGE_CLASS[s as EntitySlug] ?? FALLBACK}`}
        >
          {entityShort(s)}
        </span>
      ))}
    </span>
  )
}

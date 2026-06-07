import type { Database } from '@/types/supabase'
import { ENTITY_ORDER, entityLabel } from '@/lib/entities/config'

type Entity = Database['public']['Tables']['entities']['Row']

function rank(type: string) {
  const i = ENTITY_ORDER.indexOf(type)
  return i === -1 ? ENTITY_ORDER.length : i
}

/**
 * Renders the SET of entity "personalities" a project belongs to (Sprint 12
 * multi-entity). Each chip shows the entity's colour dot + label. Sorted into
 * canonical order for stable display.
 */
export function ProjectEntityChips({ entities, className = '' }: { entities: Entity[]; className?: string }) {
  if (entities.length === 0) return null
  const sorted = [...entities].sort((a, b) => rank(a.type) - rank(b.type))
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      {sorted.map(entity => (
        <span key={entity.id} className="flex items-center gap-1 text-xs text-gray-500">
          <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entity.color ?? '#6366f1' }} />
          {entityLabel(entity.type)}
        </span>
      ))}
    </span>
  )
}

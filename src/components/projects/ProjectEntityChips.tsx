import type { Database } from '@/types/supabase'

type Entity = Database['public']['Tables']['entities']['Row']

const ENTITY_LABELS: Record<string, string> = {
  tm: 'Triplemeter',
  sf: 'SF Solutions',
  sfe: 'SF Enterprises',
  personal: 'Personal',
}

// Canonical display order by entity type/slug.
const TYPE_ORDER = ['tm', 'sf', 'sfe', 'sfc', 'personal']
function rank(type: string) {
  const i = TYPE_ORDER.indexOf(type)
  return i === -1 ? TYPE_ORDER.length : i
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
          {ENTITY_LABELS[entity.type] ?? entity.name}
        </span>
      ))}
    </span>
  )
}

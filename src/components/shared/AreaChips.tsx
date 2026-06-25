/**
 * Renders a knowledge item's Area chips (Sprint 13 A2). The caller resolves the
 * entry's area ids to names (via the loaded area catalogue) and passes the names;
 * unknown ids are dropped. Renders nothing when there are no areas.
 */

interface Props {
  names: string[]
  className?: string
}

export function AreaChips({ names, className = '' }: Props) {
  if (names.length === 0) return null
  return (
    <span className={`inline-flex flex-wrap items-center gap-1 ${className}`}>
      {names.map(n => (
        <span
          key={n}
          className="rounded-full border border-indigo-100 bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700"
        >
          ◇ {n}
        </span>
      ))}
    </span>
  )
}

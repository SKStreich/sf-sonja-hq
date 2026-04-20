import type { ProjectStatus, ProjectPriority } from '@/types/supabase'

const STATUS_CONFIG: Record<ProjectStatus, { label: string; className: string }> = {
  planning:  { label: 'Planning',  className: 'bg-gray-800 text-gray-300' },
  active:    { label: 'Active',    className: 'bg-indigo-900/60 text-indigo-300' },
  on_hold:   { label: 'On Hold',   className: 'bg-yellow-900/60 text-yellow-300' },
  complete:  { label: 'Complete',  className: 'bg-green-900/60 text-green-300' },
}

const PRIORITY_CONFIG: Record<ProjectPriority, { label: string; className: string }> = {
  high:   { label: 'High',   className: 'bg-red-900/60 text-red-300' },
  medium: { label: 'Medium', className: 'bg-orange-900/60 text-orange-300' },
  low:    { label: 'Low',    className: 'bg-gray-800 text-gray-400' },
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { label, className } = STATUS_CONFIG[status]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
}

export function ProjectPriorityBadge({ priority }: { priority: ProjectPriority }) {
  const { label, className } = PRIORITY_CONFIG[priority]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
}

import type { ProjectStatus, ProjectPriority } from '@/types/supabase'

const STATUS_CONFIG: Record<ProjectStatus, { label: string; className: string }> = {
  planning:  { label: 'Planning',  className: 'bg-gray-100 text-gray-600' },
  active:    { label: 'Active',    className: 'bg-indigo-100 text-indigo-700' },
  on_hold:   { label: 'On Hold',   className: 'bg-amber-100 text-amber-700' },
  complete:  { label: 'Complete',  className: 'bg-green-100 text-green-700' },
}

const PRIORITY_CONFIG: Record<ProjectPriority, { label: string; className: string }> = {
  high:   { label: 'High',   className: 'bg-red-100 text-red-700' },
  medium: { label: 'Medium', className: 'bg-orange-100 text-orange-700' },
  low:    { label: 'Low',    className: 'bg-gray-100 text-gray-500' },
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const { label, className } = STATUS_CONFIG[status]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
}

export function ProjectPriorityBadge({ priority }: { priority: ProjectPriority }) {
  const { label, className } = PRIORITY_CONFIG[priority]
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
}

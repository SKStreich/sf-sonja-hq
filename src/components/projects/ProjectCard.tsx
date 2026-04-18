import Link from 'next/link'
import type { Database } from '@/types/supabase'
import { ProjectStatusBadge, ProjectPriorityBadge } from './ProjectStatusBadge'

type Project = Database['public']['Tables']['projects']['Row'] & {
  next_action_type?: string | null
  next_action_due?: string | null
}
type Entity = Database['public']['Tables']['entities']['Row']

const ENTITY_LABELS: Record<string, string> = {
  tm: 'Triplemeter',
  sf: 'SF Solutions',
  sfe: 'SF Enterprises',
  personal: 'Personal',
}

const ACTION_TYPE_LABELS: Record<string, string> = {
  meeting: 'Meeting', call: 'Call', email: 'Email', create_file: 'Create File',
  review: 'Review', design: 'Design', deploy: 'Deploy', research: 'Research', other: 'Other',
}

interface ProjectCardProps {
  project: Project
  entity?: Entity
}

export function ProjectCard({ project, entity }: ProjectCardProps) {
  const isOverdue = project.due_date && new Date(project.due_date + 'T23:59:59') < new Date() && project.status !== 'complete'
  const nextActionOverdue = (project as any).next_action_due &&
    new Date((project as any).next_action_due + 'T23:59:59') < new Date() &&
    project.status !== 'complete'

  return (
    <Link href={`/dashboard/projects/${project.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-4 hover:border-gray-700 hover:bg-gray-800/60 transition-all">

      {/* Name + status */}
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-white leading-snug group-hover:text-indigo-300 transition-colors line-clamp-2">
          {project.name}
        </h3>
        <ProjectStatusBadge status={project.status} />
      </div>

      {/* Description */}
      {project.description && (
        <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{project.description}</p>
      )}

      {/* Next action */}
      {project.next_action && (
        <div className={`rounded-lg px-3 py-2 ${nextActionOverdue ? 'bg-red-950/40 border border-red-900/30' : 'bg-gray-950/60'}`}>
          <div className="flex items-center gap-1.5 mb-0.5">
            {(project as any).next_action_type && (
              <span className={`text-xs font-medium uppercase tracking-wider ${nextActionOverdue ? 'text-red-400' : 'text-indigo-500'}`}>
                {ACTION_TYPE_LABELS[(project as any).next_action_type]}
              </span>
            )}
            {nextActionOverdue && <span className="text-xs text-red-400">⚠ overdue</span>}
          </div>
          <p className="text-xs text-gray-400 line-clamp-1">{project.next_action}</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <div className="flex items-center gap-2">
          {entity && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: entity.color ?? '#6366f1' }} />
              {ENTITY_LABELS[entity.type] ?? entity.name}
            </span>
          )}
          <ProjectPriorityBadge priority={project.priority} />
        </div>
        {project.due_date && (
          <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
            {isOverdue ? '⚠ ' : ''}
            {new Date(project.due_date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {/* Phase */}
      {project.phase && (
        <div className="text-xs text-gray-600 border-t border-gray-800 pt-2 uppercase tracking-wider">
          {project.phase}
        </div>
      )}
    </Link>
  )
}

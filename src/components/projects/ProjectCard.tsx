import Link from 'next/link'
import type { Database } from '@/types/supabase'
import { ProjectStatusBadge, ProjectPriorityBadge } from './ProjectStatusBadge'

type Project = Database['public']['Tables']['projects']['Row']
type Entity = Database['public']['Tables']['entities']['Row']

interface ProjectCardProps {
  project: Project
  entity?: Entity
}

export function ProjectCard({ project, entity }: ProjectCardProps) {
  const isOverdue = project.due_date && new Date(project.due_date) < new Date() && project.status !== 'complete'

  return (
    <Link href={`/dashboard/projects/${project.id}`}
      className="group flex flex-col gap-3 rounded-xl border border-gray-800 bg-gray-900 p-5 hover:border-gray-700 hover:bg-gray-800/60 transition-all">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-sm font-semibold text-white leading-snug group-hover:text-indigo-300 transition-colors line-clamp-2">
          {project.name}
        </h3>
        <ProjectStatusBadge status={project.status} />
      </div>

      {project.description && (
        <p className="text-xs text-gray-500 line-clamp-2">{project.description}</p>
      )}

      {project.next_action && (
        <div className="rounded-lg bg-gray-950/60 px-3 py-2">
          <p className="text-xs text-gray-400"><span className="text-gray-600">Next: </span>{project.next_action}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-auto pt-1">
        <div className="flex items-center gap-2">
          {entity && (
            <span className="flex items-center gap-1 text-xs text-gray-500">
              <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: entity.color }} />
              {entity.name}
            </span>
          )}
          <ProjectPriorityBadge priority={project.priority} />
        </div>
        {project.due_date && (
          <span className={`text-xs ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
            {isOverdue ? '⚠ ' : ''}
            {new Date(project.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>

      {project.phase && (
        <div className="text-xs text-gray-600 border-t border-gray-800 pt-2">Phase: {project.phase}</div>
      )}
    </Link>
  )
}

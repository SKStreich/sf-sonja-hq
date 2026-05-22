'use client'
import { useRouter } from 'next/navigation'
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel'

/**
 * Thin client wrapper around `TaskDetailPanel` for the dedicated
 * `/dashboard/tasks/[id]` page. The panel was designed as a side-panel with
 * an internal close button; on a dedicated page, that button navigates back
 * to the task list instead.
 */
export function TaskDetailFullPage({ task, projects, entities, members }: {
  task: any
  projects: any[]
  entities: any[]
  members: any[]
}) {
  const router = useRouter()
  return (
    <TaskDetailPanel
      task={task}
      projects={projects}
      entities={entities}
      members={members}
      onClose={() => router.push('/dashboard/tasks')}
    />
  )
}

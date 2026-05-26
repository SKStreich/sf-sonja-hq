export const ACTIVITY_PAGE_SIZE = 20

export interface ActivityRow {
  activity_type: 'field_change' | 'project_update'
  id: string
  org_id: string
  occurred_at: string
  actor_id: string | null
  entity_type: 'task' | 'project'
  entity_id: string
  field_name: string | null
  previous_value: string | null
  new_value: string | null
  update_content: string | null
  update_subtype: string | null
  actor_name: string | null
  entity_name: string | null
  task_project_id: string | null
  task_project_name: string | null
  new_assignee_name: string | null
}

export function renderFieldChange(row: ActivityRow): string {
  const actor = row.actor_name ?? '(System)'
  const entity = row.entity_type
  const name = row.entity_name ?? `(deleted ${entity})`
  switch (row.field_name) {
    case 'status':
      return `${actor} moved ${entity} "${name}" from ${row.previous_value ?? '∅'} to ${row.new_value ?? '∅'}`
    case 'priority':
      return `${actor} changed priority on ${entity} "${name}" from ${row.previous_value ?? '∅'} to ${row.new_value ?? '∅'}`
    case 'due_date':
      return row.new_value
        ? `${actor} set due date on ${entity} "${name}" to ${row.new_value}`
        : `${actor} cleared due date on ${entity} "${name}"`
    case 'assignee_id':
      return row.new_value
        ? `${actor} reassigned task "${name}" to ${row.new_assignee_name ?? '(unknown user)'}`
        : `${actor} unassigned task "${name}"`
    case 'project_id':
      return row.new_value
        ? `${actor} moved task "${name}" to project ${row.task_project_name ?? '(unknown project)'}`
        : `${actor} removed task "${name}" from its project`
    case 'phase':
      return row.new_value
        ? `${actor} set phase on project "${name}" to ${row.new_value}`
        : `${actor} cleared phase on project "${name}"`
    default:
      return `${actor} changed ${row.field_name} on ${entity} "${name}"`
  }
}

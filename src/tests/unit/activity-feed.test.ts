import { describe, expect, it } from 'vitest'
import { renderFieldChange, type ActivityRow } from '@/lib/activity-feed'

function row(overrides: Partial<ActivityRow>): ActivityRow {
  return {
    activity_type: 'field_change',
    id: 'eh-1',
    org_id: 'org-1',
    occurred_at: '2026-05-26T12:00:00Z',
    actor_id: 'user-1',
    entity_type: 'task',
    entity_id: 'task-1',
    field_name: 'status',
    previous_value: null,
    new_value: null,
    update_content: null,
    update_subtype: null,
    actor_name: 'Sonja',
    entity_name: 'Wire up Stripe webhook',
    task_project_id: null,
    task_project_name: null,
    new_assignee_name: null,
    ...overrides,
  }
}

describe('renderFieldChange — field-aware copy templates', () => {
  it('status: includes prev → new', () => {
    const text = renderFieldChange(
      row({ field_name: 'status', previous_value: 'in_progress', new_value: 'done' }),
    )
    expect(text).toBe('Sonja moved task "Wire up Stripe webhook" from in_progress to done')
  })

  it('priority: includes prev → new', () => {
    const text = renderFieldChange(
      row({ field_name: 'priority', previous_value: 'medium', new_value: 'high' }),
    )
    expect(text).toBe('Sonja changed priority on task "Wire up Stripe webhook" from medium to high')
  })

  it('due_date set: includes new value', () => {
    const text = renderFieldChange(
      row({ field_name: 'due_date', previous_value: null, new_value: '2026-06-08' }),
    )
    expect(text).toBe('Sonja set due date on task "Wire up Stripe webhook" to 2026-06-08')
  })

  it('due_date cleared: explicit clear copy', () => {
    const text = renderFieldChange(
      row({ field_name: 'due_date', previous_value: '2026-06-08', new_value: null }),
    )
    expect(text).toBe('Sonja cleared due date on task "Wire up Stripe webhook"')
  })

  it('assignee reassigned: shows new assignee name', () => {
    const text = renderFieldChange(
      row({
        field_name: 'assignee_id',
        previous_value: 'user-x',
        new_value: 'user-y',
        new_assignee_name: 'Jordan',
      }),
    )
    expect(text).toBe('Sonja reassigned task "Wire up Stripe webhook" to Jordan')
  })

  it('assignee unassigned: explicit copy', () => {
    const text = renderFieldChange(
      row({ field_name: 'assignee_id', previous_value: 'user-x', new_value: null }),
    )
    expect(text).toBe('Sonja unassigned task "Wire up Stripe webhook"')
  })

  it('project_id move: shows target project name', () => {
    const text = renderFieldChange(
      row({
        field_name: 'project_id',
        previous_value: 'p1',
        new_value: 'p2',
        task_project_name: 'SF Ops · Phase 5.3.3',
      }),
    )
    expect(text).toBe('Sonja moved task "Wire up Stripe webhook" to project SF Ops · Phase 5.3.3')
  })

  it('phase change on project', () => {
    const text = renderFieldChange(
      row({
        entity_type: 'project',
        entity_name: 'Notion cutover',
        field_name: 'phase',
        previous_value: 'discovery',
        new_value: 'execution',
      }),
    )
    expect(text).toBe('Sonja set phase on project "Notion cutover" to execution')
  })

  it('falls back to (System) when actor missing', () => {
    const text = renderFieldChange(
      row({
        actor_name: null,
        field_name: 'status',
        previous_value: 'todo',
        new_value: 'done',
      }),
    )
    expect(text).toBe('(System) moved task "Wire up Stripe webhook" from todo to done')
  })

  it('falls back to (deleted task) when entity_name missing', () => {
    const text = renderFieldChange(
      row({
        entity_name: null,
        field_name: 'status',
        previous_value: 'todo',
        new_value: 'done',
      }),
    )
    expect(text).toBe('Sonja moved task "(deleted task)" from todo to done')
  })

  it('renders project entity_type with correct label', () => {
    const text = renderFieldChange(
      row({
        entity_type: 'project',
        entity_name: 'Notion cutover',
        field_name: 'status',
        previous_value: 'planning',
        new_value: 'active',
      }),
    )
    expect(text).toBe('Sonja moved project "Notion cutover" from planning to active')
  })
})

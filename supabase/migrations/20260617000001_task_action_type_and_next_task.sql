-- Tasks gain an "action type" (same vocabulary as projects.next_action_type), so
-- a task now carries the full shape of a project's "next action":
--   action type + description (title) + due date.
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS action_type TEXT
    CHECK (action_type IN ('meeting','call','email','create_file','review','design','deploy','research','other'));

-- A project points at its current "next action" task (the headline task, pinned
-- first in the task list). The next_action* columns on projects are kept as a
-- denormalized cache of this task (synced by the app layer) so existing read
-- sites — dashboard ordering, project cards, list view — keep working unchanged.
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS next_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL;

-- Backfill: every existing project that has a free-text next_action but no task
-- for it yet gets a real, completable task created from its next_action fields,
-- and the project is pointed at it. Skips projects with no entity (tasks require
-- a non-null entity_id) — none should exist post multi-entity cutover.
WITH proj AS (
  SELECT p.id,
         p.org_id,
         p.created_by,
         p.next_action,
         p.next_action_type,
         p.next_action_due,
         (SELECT pe.entity_id FROM project_entities pe WHERE pe.project_id = p.id LIMIT 1) AS entity_id
  FROM projects p
  WHERE p.next_action IS NOT NULL
    AND btrim(p.next_action) <> ''
    AND p.next_task_id IS NULL
),
ins AS (
  INSERT INTO tasks (org_id, user_id, created_by, entity_id, project_id,
                     title, action_type, status, priority, due_date,
                     gtd_bucket, archived)
  SELECT proj.org_id, proj.created_by, proj.created_by, proj.entity_id, proj.id,
         proj.next_action, proj.next_action_type, 'todo', 'medium', proj.next_action_due,
         'backlog', false
  FROM proj
  WHERE proj.entity_id IS NOT NULL
  RETURNING id, project_id
)
UPDATE projects SET next_task_id = ins.id
FROM ins
WHERE projects.id = ins.project_id;

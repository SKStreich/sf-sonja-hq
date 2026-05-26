-- ─────────────────────────────────────────────────────────────────────────────
-- recent_activity_feed — merged view of entity_history + project_updates.
--
-- Cross-project audit row 4, Sprint 12. Spec:
--   docs/specs/hq_history-ui-phase2_v2.html  (section "Merged dashboard feed")
--
-- security_invoker = true so RLS cascades from the underlying tables to the
-- view. A user who can't read a given entity_history row (private task,
-- different org) automatically can't see it through the view either.
--
-- Activity-type discriminator: 'field_change' | 'project_update'. UI uses
-- this to render distinct flag chips and to support client-side filtering.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE VIEW recent_activity_feed
WITH (security_invoker = true) AS
SELECT
  'field_change'::text       AS activity_type,
  eh.id                      AS id,
  eh.org_id                  AS org_id,
  eh.changed_at              AS occurred_at,
  eh.changed_by              AS actor_id,
  eh.entity_type::text       AS entity_type,
  eh.entity_id               AS entity_id,
  eh.field_name              AS field_name,
  eh.previous_value          AS previous_value,
  eh.new_value               AS new_value,
  NULL::text                 AS update_content,
  NULL::text                 AS update_subtype
FROM entity_history eh

UNION ALL

SELECT
  'project_update'::text,
  pu.id,
  pu.org_id,
  pu.created_at,
  pu.user_id,
  'project'::text,
  pu.project_id,
  NULL::text,
  NULL::text,
  NULL::text,
  pu.content,
  pu.update_type
FROM project_updates pu;

-- ─────────────────────────────────────────────────────────────────────────────
-- get_recent_activity — joined feed query with cursor pagination.
--
-- Returns up to (page_size + 1) rows. Callers use the +1 row to detect "has
-- more" and surface it as nextCursor. Joins actor_name, entity_name,
-- task_project_name, and new_assignee_name (for assignee_id rows).
--
-- SECURITY INVOKER (default) — RLS on entity_history + project_updates +
-- tasks + projects + user_profiles all cascade through.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_recent_activity(
  before_cursor TIMESTAMPTZ DEFAULT NOW(),
  page_size     INT DEFAULT 20
)
RETURNS TABLE (
  activity_type      TEXT,
  id                 UUID,
  org_id             UUID,
  occurred_at        TIMESTAMPTZ,
  actor_id           UUID,
  entity_type        TEXT,
  entity_id          UUID,
  field_name         TEXT,
  previous_value     TEXT,
  new_value          TEXT,
  update_content     TEXT,
  update_subtype     TEXT,
  actor_name         TEXT,
  entity_name        TEXT,
  task_project_id    UUID,
  task_project_name  TEXT,
  new_assignee_name  TEXT
)
LANGUAGE sql STABLE AS $$
  SELECT
    f.activity_type,
    f.id,
    f.org_id,
    f.occurred_at,
    f.actor_id,
    f.entity_type,
    f.entity_id,
    f.field_name,
    f.previous_value,
    f.new_value,
    f.update_content,
    f.update_subtype,
    up.full_name                         AS actor_name,
    COALESCE(t.title, p.name)            AS entity_name,
    t.project_id                         AS task_project_id,
    pp.name                              AS task_project_name,
    asg.full_name                        AS new_assignee_name
  FROM recent_activity_feed f
  LEFT JOIN user_profiles up   ON up.id = f.actor_id
  LEFT JOIN tasks t            ON f.entity_type = 'task'    AND t.id = f.entity_id
  LEFT JOIN projects p         ON f.entity_type = 'project' AND p.id = f.entity_id
  LEFT JOIN projects pp        ON t.project_id = pp.id
  LEFT JOIN user_profiles asg  ON f.field_name = 'assignee_id'
                              AND f.new_value IS NOT NULL
                              AND asg.id = f.new_value::uuid
  WHERE f.occurred_at < before_cursor
  ORDER BY f.occurred_at DESC
  LIMIT (page_size + 1);
$$;

COMMIT;

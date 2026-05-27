-- ─────────────────────────────────────────────────────────────────────────────
-- entity_history — generic field-change log for tasks + projects.
--
-- Cross-project audit row 4, Sprint 12. Spec:
--   docs/specs/hq_history-ui-phase2_v2.html
--
-- Generic shape: (entity_type, entity_id, field_name, previous_value, new_value)
-- with values cast to TEXT. Polymorphic entity_id is intentional — Postgres
-- doesn't support polymorphic FKs, and history is append-only: orphan rows
-- after parent delete are acceptable (UI joins LEFT and renders "(deleted X)").
--
-- RLS: tenant-scoped, with task confidentiality cascade via EXISTS-join to the
-- live tasks row (the tasks SELECT itself enforces confidentiality_tier).
-- Append-only — no INSERT/UPDATE/DELETE policies; only the SECURITY DEFINER
-- trigger (next migration) is permitted to write.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

CREATE TYPE entity_history_entity_type AS ENUM ('task', 'project');

CREATE TABLE entity_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entity_type     entity_history_entity_type NOT NULL,
  entity_id       UUID NOT NULL,
  field_name      TEXT NOT NULL,
  previous_value  TEXT,
  new_value       TEXT,
  changed_by      UUID REFERENCES auth.users(id),
  changed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entity_history_lookup
  ON entity_history (entity_type, entity_id, changed_at DESC);

CREATE INDEX idx_entity_history_feed
  ON entity_history (org_id, changed_at DESC);

ALTER TABLE entity_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entity_history_read" ON entity_history
  FOR SELECT USING (
    org_id = get_my_org_id()
    AND (
      entity_type = 'project'
      OR (
        entity_type = 'task'
        AND EXISTS (SELECT 1 FROM tasks t WHERE t.id = entity_history.entity_id)
      )
    )
  );

COMMIT;

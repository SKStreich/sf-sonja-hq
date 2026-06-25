-- Sprint 13 · Areas — A1 substrate (concept #2 of HQ Knowledge ae15bcf5).
-- Spec: docs/specs/hq_areas_v1.html (LOCKED 2026-06-25), §4 Data model.
--
-- An "area" is a middle tier between entity and tags: a small, ordered, per-entity
-- set of buckets that knowledge entries, projects, and tasks can be filed under.
-- D1: an area belongs to exactly one entity. D2: items get areas through one
-- junction per item type (multi-area). This migration adds the catalogue + the
-- three junctions + RLS + an orgs-driven seed for the high-traffic entities (D5).
-- Item-assignment UI lands in A2 (knowledge) / A3 (projects + tasks); the
-- junctions are created now so those slices are pure code.

BEGIN;

-- ── areas catalogue ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS areas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entity      TEXT NOT NULL CHECK (entity = ANY (ARRAY['tm','cthq','sfe','sfo','sfs','sfc','personal'])),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, entity, slug)
);
CREATE INDEX IF NOT EXISTS idx_areas_entity ON areas (org_id, entity, sort_order);

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
-- Org tenant-isolation, matching the entities/get_my_org_id() pattern. The manage
-- UI is additionally gated to admins at the page level (Settings).
CREATE POLICY areas_all ON areas FOR ALL
  USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- ── junctions (one per item type) ────────────────────────────────────────────
-- RLS mirrors the multi-entity junctions (20260531000001): read + write ride the
-- parent's own RLS via an `IN (SELECT id FROM parent)` subquery.

CREATE TABLE IF NOT EXISTS knowledge_entry_areas (
  entry_id    UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  area_id     UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entry_id, area_id)
);
CREATE INDEX IF NOT EXISTS idx_kea_area ON knowledge_entry_areas (org_id, area_id);
ALTER TABLE knowledge_entry_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY kea_read ON knowledge_entry_areas FOR SELECT
  USING (entry_id IN (SELECT id FROM knowledge_entries));
CREATE POLICY kea_insert ON knowledge_entry_areas FOR INSERT
  WITH CHECK (entry_id IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid()));
CREATE POLICY kea_delete ON knowledge_entry_areas FOR DELETE
  USING (entry_id IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid()));

CREATE TABLE IF NOT EXISTS project_areas (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  area_id     UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, area_id)
);
CREATE INDEX IF NOT EXISTS idx_pa_area ON project_areas (org_id, area_id);
ALTER TABLE project_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY pa_read ON project_areas FOR SELECT
  USING (project_id IN (SELECT id FROM projects));
CREATE POLICY pa_insert ON project_areas FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects));
CREATE POLICY pa_delete ON project_areas FOR DELETE
  USING (project_id IN (SELECT id FROM projects));

CREATE TABLE IF NOT EXISTS task_areas (
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  area_id     UUID NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (task_id, area_id)
);
CREATE INDEX IF NOT EXISTS idx_ta_area ON task_areas (org_id, area_id);
ALTER TABLE task_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY ta_read ON task_areas FOR SELECT
  USING (task_id IN (SELECT id FROM tasks));
CREATE POLICY ta_insert ON task_areas FOR INSERT
  WITH CHECK (task_id IN (SELECT id FROM tasks));
CREATE POLICY ta_delete ON task_areas FOR DELETE
  USING (task_id IN (SELECT id FROM tasks));

-- ── seed: high-traffic entities (D5) ─────────────────────────────────────────
-- Orgs-driven + idempotent on (org_id, entity, slug) so it replays clean on a
-- fresh DB in the integration lane (the pattern that lane established). Sonja
-- can add/rename/reorder/delete afterward in Settings → Areas.
INSERT INTO areas (org_id, entity, name, slug, sort_order)
SELECT o.id, s.entity, s.name, s.slug, s.sort_order
FROM orgs o
CROSS JOIN (VALUES
  ('tm','Migration','migration',0),
  ('tm','Product','product',1),
  ('tm','Operations','operations',2),
  ('tm','Customers','customers',3),
  ('sfo','Work Orders','work-orders',0),
  ('sfo','Invoicing','invoicing',1),
  ('sfo','Field Ops','field-ops',2),
  ('sfo','Comms','comms',3),
  ('sfo','Platform','platform',4),
  ('sfs','Clients','clients',0),
  ('sfs','Connectors','connectors',1),
  ('sfs','Metrics','metrics',2),
  ('sfs','Engagements','engagements',3),
  ('personal','Sonja HQ','sonja-hq',0),
  ('personal','KRC','krc',1),
  ('personal','Learning','learning',2),
  ('personal','Admin','admin',3)
) AS s(entity, name, slug, sort_order)
ON CONFLICT (org_id, entity, slug) DO NOTHING;

COMMIT;

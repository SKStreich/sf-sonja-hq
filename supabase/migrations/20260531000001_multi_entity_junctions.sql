-- Sprint 12 — Multi-entity foundation (PR 1)
--
-- Lets a knowledge entry / project belong to MORE THAN ONE entity
-- ("personality"). Flat many-to-many — no primary; every entity is an equal
-- member of the set.
--
-- Spec:    docs/specs/hq_multi-entity-and-doc-linking_v1.html
-- Locked:  flat M2M · documents + projects · single-cutover (OQ1) ·
--          app-layer "≥1 entity" guard (OQ2).
--
-- This migration is ADDITIVE ONLY. It:
--   1. creates the two junction tables (+ RLS + indexes),
--   2. backfills them from the existing single-entity columns, and
--   3. installs transitional ADD-ONLY mirror triggers so the junctions stay
--      populated for any write that still flows through the legacy columns
--      during the PR1 → PR2 window.
--
-- The legacy columns (knowledge_entries.entity, projects.entity_id) and these
-- mirror triggers are removed in the final cutover PR, once every read and
-- write goes through the junctions. The triggers are ADD-ONLY (INSERT ...
-- ON CONFLICT DO NOTHING, never DELETE) specifically so they cannot clobber a
-- multi-entity set that PR2's UI writes directly to the junction.

BEGIN;

-- ── knowledge_entry_entities ─────────────────────────────────────────────────
-- knowledge_entries.entity is plain TEXT under a CHECK enum (includes 'sfc');
-- the junction mirrors that representation exactly so the backfill can't violate
-- the constraint.
CREATE TABLE IF NOT EXISTS knowledge_entry_entities (
  entry_id    UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  entity      TEXT NOT NULL CHECK (entity = ANY (ARRAY['tm','sf','sfe','sfc','personal'])),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entry_id, entity)
);
CREATE INDEX IF NOT EXISTS idx_kee_entity ON knowledge_entry_entities (org_id, entity);

ALTER TABLE knowledge_entry_entities ENABLE ROW LEVEL SECURITY;

-- Read visibility mirrors the parent entry: the subquery is itself RLS-filtered
-- by ke_read (standard = same org; vault = owner/grantee), so a junction row is
-- visible iff its entry is.
CREATE POLICY kee_read ON knowledge_entry_entities FOR SELECT
  USING (entry_id IN (SELECT id FROM knowledge_entries));
CREATE POLICY kee_insert ON knowledge_entry_entities FOR INSERT
  WITH CHECK (entry_id IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid()));
CREATE POLICY kee_delete ON knowledge_entry_entities FOR DELETE
  USING (entry_id IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid()));

-- ── project_entities ─────────────────────────────────────────────────────────
-- projects.entity_id is a FK to the entities table; the junction mirrors that.
CREATE TABLE IF NOT EXISTS project_entities (
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entity_id   UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (project_id, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_pe_entity ON project_entities (org_id, entity_id);

ALTER TABLE project_entities ENABLE ROW LEVEL SECURITY;

-- projects RLS is org tenant-isolation (FOR ALL), so `project_id IN
-- (SELECT id FROM projects)` resolves to same-org projects only.
CREATE POLICY pe_read ON project_entities FOR SELECT
  USING (project_id IN (SELECT id FROM projects));
CREATE POLICY pe_insert ON project_entities FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects));
CREATE POLICY pe_delete ON project_entities FOR DELETE
  USING (project_id IN (SELECT id FROM projects));

-- ── backfill: one junction row per existing single-entity value ──────────────
INSERT INTO knowledge_entry_entities (entry_id, entity, org_id)
  SELECT id, entity, org_id FROM knowledge_entries
  ON CONFLICT DO NOTHING;

INSERT INTO project_entities (project_id, entity_id, org_id)
  SELECT id, entity_id, org_id FROM projects
  ON CONFLICT DO NOTHING;

-- ── transitional ADD-ONLY mirror triggers ───────────────────────────────────
-- Guarantee every entry/project written via the legacy column keeps ≥1 junction
-- row through the PR1 → PR2 window. SECURITY DEFINER so the insert succeeds
-- regardless of the caller's RLS context (mirrors the history triggers'
-- rationale — it only writes a row derived from a row the caller could write).
CREATE OR REPLACE FUNCTION mirror_entry_entity() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO knowledge_entry_entities (entry_id, entity, org_id)
    VALUES (NEW.id, NEW.entity, NEW.org_id)
    ON CONFLICT (entry_id, entity) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_mirror_entry_entity
  AFTER INSERT OR UPDATE OF entity ON knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION mirror_entry_entity();

CREATE OR REPLACE FUNCTION mirror_project_entity() RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO project_entities (project_id, entity_id, org_id)
    VALUES (NEW.id, NEW.entity_id, NEW.org_id)
    ON CONFLICT (project_id, entity_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER trg_mirror_project_entity
  AFTER INSERT OR UPDATE OF entity_id ON projects
  FOR EACH ROW EXECUTE FUNCTION mirror_project_entity();

COMMIT;

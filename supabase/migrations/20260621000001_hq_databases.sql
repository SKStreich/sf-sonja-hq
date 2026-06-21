-- HQ Databases primitive — Phase B1 (data model + RLS)
--
-- Spec:   docs/specs/hq_databases_v1.html (LOCKED 2026-06-20; HQ Knowledge 0ed77d44)
-- Locked: OQ-2 JSONB record values · OQ-6 imported dbs default entity 'tm' ·
--         org RLS + entity tagging is the only access boundary (no per-row perms).
--
-- A Notion-parity "database": a named collection of typed records (columns =
-- properties, rows = records) belonging to an org and an entity set. This
-- migration is the SUBSTRATE only — B1 ships a READ-ONLY table view over it;
-- in-app row/column editing + the Notion importer arrive in B2/B3. Writes here
-- come from the service role (seed / future importer) for now, but full
-- org-scoped write policies are installed up front so B3 needs no RLS migration.
--
-- ADDITIVE ONLY. Four tables, all org-scoped under the existing
-- get_my_org_id() tenant-isolation pattern (mirrors projects / entities).
-- Replay-safe: no seed data, no hardcoded org — a demo database is seeded
-- separately (post-apply) so a clean migration replay onto an empty DB passes.

BEGIN;

-- ── hq_databases ─────────────────────────────────────────────────────────────
-- Top-level object. org_id is the RLS boundary, exactly like projects/entities.
CREATE TABLE IF NOT EXISTS hq_databases (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  icon        TEXT,
  description TEXT,
  created_by  UUID REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hq_databases_org ON hq_databases (org_id);

ALTER TABLE hq_databases ENABLE ROW LEVEL SECURITY;

-- Tenant isolation, identical shape to projects_tenant_isolation. FOR ALL so the
-- future importer / in-app editor (B3) is already covered; reads are the only
-- path exercised in B1.
CREATE POLICY hq_databases_tenant_isolation ON hq_databases FOR ALL
  USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- ── hq_db_properties ─────────────────────────────────────────────────────────
-- The schema: one row per column. `config` carries type-specific extras
-- (select option list, relation target db id, number format, …) as JSONB.
CREATE TABLE IF NOT EXISTS hq_db_properties (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL REFERENCES hq_databases(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type = ANY (ARRAY[
                'text','number','select','multi_select',
                'status','checkbox','date','url','relation'])),
  position    INTEGER NOT NULL DEFAULT 0,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_title    BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_hq_db_properties_db ON hq_db_properties (database_id, position);
-- At most one title property per database.
CREATE UNIQUE INDEX IF NOT EXISTS uq_hq_db_properties_title
  ON hq_db_properties (database_id) WHERE is_title;

ALTER TABLE hq_db_properties ENABLE ROW LEVEL SECURITY;

-- Visibility/writability mirrors the parent database: the subquery is itself
-- RLS-filtered by hq_databases_tenant_isolation, so a property row is reachable
-- iff its database is in the caller's org (same idiom as project_entities).
CREATE POLICY hq_db_properties_access ON hq_db_properties FOR ALL
  USING (database_id IN (SELECT id FROM hq_databases))
  WITH CHECK (database_id IN (SELECT id FROM hq_databases));

-- ── hq_db_records ────────────────────────────────────────────────────────────
-- The rows. `values` is { "<property_id>": <value> }, typed at the app layer
-- (OQ-2: JSONB for v1 — filtering/sorting volumes are small).
CREATE TABLE IF NOT EXISTS hq_db_records (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  database_id UUID NOT NULL REFERENCES hq_databases(id) ON DELETE CASCADE,
  position    INTEGER NOT NULL DEFAULT 0,
  values      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_hq_db_records_db ON hq_db_records (database_id, position);

ALTER TABLE hq_db_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY hq_db_records_access ON hq_db_records FOR ALL
  USING (database_id IN (SELECT id FROM hq_databases))
  WITH CHECK (database_id IN (SELECT id FROM hq_databases));

-- ── hq_db_entities (junction) ────────────────────────────────────────────────
-- Entity tags, mirroring knowledge_entry_entities. CHECK carries the current
-- 7-entity taxonomy (tm·cthq·sfe·sfo·sfs·sfc·personal) — keep in sync with
-- src/lib/entities/config.ts and the knowledge_entry_entities CHECK.
CREATE TABLE IF NOT EXISTS hq_db_entities (
  database_id UUID NOT NULL REFERENCES hq_databases(id) ON DELETE CASCADE,
  entity      TEXT NOT NULL CHECK (entity = ANY (ARRAY[
                'tm','cthq','sfe','sfo','sfs','sfc','personal'])),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (database_id, entity)
);
CREATE INDEX IF NOT EXISTS idx_hq_db_entities_entity ON hq_db_entities (org_id, entity);

ALTER TABLE hq_db_entities ENABLE ROW LEVEL SECURITY;

CREATE POLICY hq_db_entities_access ON hq_db_entities FOR ALL
  USING (database_id IN (SELECT id FROM hq_databases))
  WITH CHECK (database_id IN (SELECT id FROM hq_databases));

COMMIT;

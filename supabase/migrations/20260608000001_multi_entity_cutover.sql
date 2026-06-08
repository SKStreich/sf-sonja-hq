-- Multi-entity FINAL CUTOVER.
--
-- The junction tables knowledge_entry_entities + project_entities have been the
-- source of truth since PR #37 (2026-05-31), kept in sync during the dual-write
-- window by two transitional add-only mirror triggers. The UI + 7-entity
-- taxonomy have soaked in prod since 06-05. Application code no longer reads or
-- writes the legacy single-entity columns.
--
-- This migration retires the dual-write era:
--   1. Drop the two mirror triggers + their functions.
--   2. Drop the legacy single-entity columns.
--
-- Backfill was verified 100% complete before applying (0 knowledge_entries and
-- 0 projects without a junction row; every legacy primary represented in the
-- junction), so dropping the columns is data-safe.
--
-- Intentionally KEPT:
--   - knowledge_versions.entity  — historical per-version snapshot (single slug)
--   - tasks.entity_id            — tasks remain single-entity (locked decision)
--
-- No CASCADE: verified no views/materialized views and no RLS policies depend on
-- either column. The knowledge_entries.entity CHECK constraint and the
-- projects.entity_id FK drop automatically with their columns.

-- 1. Mirror triggers + functions.
DROP TRIGGER IF EXISTS trg_mirror_entry_entity ON knowledge_entries;
DROP FUNCTION IF EXISTS mirror_entry_entity();

DROP TRIGGER IF EXISTS trg_mirror_project_entity ON projects;
DROP FUNCTION IF EXISTS mirror_project_entity();

-- 2. Legacy single-entity columns.
ALTER TABLE knowledge_entries DROP COLUMN entity;
ALTER TABLE projects DROP COLUMN entity_id;

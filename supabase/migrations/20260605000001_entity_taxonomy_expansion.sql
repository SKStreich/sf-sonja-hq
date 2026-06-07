-- Sprint 12 — Entity taxonomy expansion (5 → 7 entities)
--
-- Final set: tm · cthq · sfe · sfo · sfs · sfc · personal
--   - tm        Triplemeter                 (unchanged)
--   - cthq      CTHQ                         (NEW)
--   - sfe       Streich Force Enterprises    (unchanged)
--   - sfo       Streich Force Operations     (NEW)
--   - sfs       Streich Force Solutions      (RENAMED from 'sf' — keeps all data)
--   - sfc       SF-Containers                (unchanged)
--   - personal  Personal                     (unchanged)
--
-- Decision (Sonja, 2026-06-05): the existing 'sf' (Streich Force Solutions)
-- data — 15 knowledge entries + 2 projects — is Solutions, so 'sf' is RENAMED
-- to 'sfs' (data preserved). 'sfo' (Operations) is brand-new/empty.
--
-- ⚠️ APPLIED IN TWO STEPS via Supabase MCP (NOT a single transaction):
-- Postgres forbids using an enum value in the same transaction that adds it, so
-- STEP 1 (enum alterations) must COMMIT before STEP 2 (rows that use the new
-- values). HQ applies migrations via MCP `apply_migration`, one step per call.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — entity_type enum (entities.type). RENAME auto-migrates the existing
-- 'sf' entities row + keeps projects/tasks FKs intact (they reference id).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE entity_type RENAME VALUE 'sf' TO 'sfs';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'sfo';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'cthq';

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 2 — new entity rows + knowledge (TEXT) slug migration + widened CHECKs.
-- ─────────────────────────────────────────────────────────────────────────────

-- New project entities (org-scoped; UNIQUE(org_id,type) makes this idempotent).
INSERT INTO entities (org_id, created_by, name, type, color, active)
SELECT '00000000-0000-0000-0000-000000000001',
       'e265355b-e887-42e1-a832-f88d8b01730f',
       'Streich Force Operations', 'sfo', '#F43F5E', true
WHERE NOT EXISTS (
  SELECT 1 FROM entities
  WHERE org_id = '00000000-0000-0000-0000-000000000001' AND type = 'sfo'
);

INSERT INTO entities (org_id, created_by, name, type, color, active)
SELECT '00000000-0000-0000-0000-000000000001',
       'e265355b-e887-42e1-a832-f88d8b01730f',
       'CTHQ', 'cthq', '#6366F1', true
WHERE NOT EXISTS (
  SELECT 1 FROM entities
  WHERE org_id = '00000000-0000-0000-0000-000000000001' AND type = 'cthq'
);

-- knowledge_entries.entity is TEXT under a CHECK enum — migrate data + widen.
ALTER TABLE knowledge_entries DROP CONSTRAINT IF EXISTS knowledge_entries_entity_check;
UPDATE knowledge_entries SET entity = 'sfs' WHERE entity = 'sf';
ALTER TABLE knowledge_entries ADD CONSTRAINT knowledge_entries_entity_check
  CHECK (entity = ANY (ARRAY['tm','cthq','sfe','sfo','sfs','sfc','personal']));

-- Multi-entity junction (same TEXT-CHECK representation).
ALTER TABLE knowledge_entry_entities DROP CONSTRAINT IF EXISTS knowledge_entry_entities_entity_check;
UPDATE knowledge_entry_entities SET entity = 'sfs' WHERE entity = 'sf';
ALTER TABLE knowledge_entry_entities ADD CONSTRAINT knowledge_entry_entities_entity_check
  CHECK (entity = ANY (ARRAY['tm','cthq','sfe','sfo','sfs','sfc','personal']));

-- Historical version snapshots have no CHECK, but a restore re-applies the old
-- entity via updateEntry() (which the new CHECK guards) — migrate so restores
-- of pre-rename versions stay valid.
UPDATE knowledge_versions SET entity = 'sfs' WHERE entity = 'sf';

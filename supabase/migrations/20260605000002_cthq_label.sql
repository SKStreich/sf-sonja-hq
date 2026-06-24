-- Entity taxonomy expansion — STEP 2 (uses the enum values added & committed in
-- 20260605000001 STEP 1). Split out of that file so a clean replay never uses a
-- new enum value in the same transaction that added it. Runs before the cthq
-- relabel below because the relabel needs the cthq row this step inserts.
-- ─────────────────────────────────────────────────────────────────────────────

-- New project entities (org-scoped; idempotent via NOT EXISTS). Driven off the
-- orgs table so a fresh/empty replay inserts 0 rows (no org → nothing to seed,
-- no FK violation); on prod the org exists and the rows are created once.
INSERT INTO entities (org_id, created_by, name, type, color, active)
SELECT o.id, 'e265355b-e887-42e1-a832-f88d8b01730f',
       'Streich Force Operations', 'sfo', '#F43F5E', true
FROM orgs o
WHERE o.id = '00000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM entities e WHERE e.org_id = o.id AND e.type = 'sfo'
  );

INSERT INTO entities (org_id, created_by, name, type, color, active)
SELECT o.id, 'e265355b-e887-42e1-a832-f88d8b01730f',
       'CTHQ', 'cthq', '#6366F1', true
FROM orgs o
WHERE o.id = '00000000-0000-0000-0000-000000000001'
  AND NOT EXISTS (
    SELECT 1 FROM entities e WHERE e.org_id = o.id AND e.type = 'cthq'
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

-- knowledge_versions.entity (per-version snapshot slug) was added out-of-band
-- via MCP and never committed, so a clean replay reaches the UPDATE below with
-- no such column. Add it idempotently here (no-op on prod, where it exists).
ALTER TABLE knowledge_versions ADD COLUMN IF NOT EXISTS entity TEXT;

-- Historical version snapshots have no CHECK, but a restore re-applies the old
-- entity via updateEntry() (which the new CHECK guards) — migrate so restores
-- of pre-rename versions stay valid.
UPDATE knowledge_versions SET entity = 'sfs' WHERE entity = 'sf';

-- ─────────────────────────────────────────────────────────────────────────────
-- CTHQ display name: 'CTHQ' → 'Container Trade HQ'.
-- (CTHQ = Container Trade HQ; slated to replace TM in the near future.)
-- The dashboard entity cards + tabs read entities.name directly, so the row's
-- name must match the registry label in src/lib/entities/config.ts.
UPDATE entities
SET name = 'Container Trade HQ', updated_at = now()
WHERE type = 'cthq' AND name = 'CTHQ';

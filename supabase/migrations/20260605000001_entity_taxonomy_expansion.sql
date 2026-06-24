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
-- STEP 1 (enum alterations, this file) must COMMIT before STEP 2 (rows that use
-- the new values). For a clean replay, each migration file is its own
-- transaction, so STEP 2 lives in the NEXT migration (20260605000002) — which
-- already had to run after these rows exist (it relabels the cthq row). This
-- file is STEP 1 only.

-- ─────────────────────────────────────────────────────────────────────────────
-- STEP 1 — entity_type enum (entities.type). RENAME auto-migrates the existing
-- 'sf' entities row + keeps projects/tasks FKs intact (they reference id).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TYPE entity_type RENAME VALUE 'sf' TO 'sfs';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'sfo';
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'cthq';

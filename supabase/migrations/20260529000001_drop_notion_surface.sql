-- ─────────────────────────────────────────────────────────────────────────────
-- Retire the Notion integration surface from HQ.
--
-- Cross-project audit row 6 (Notion cutover) — first slice: dead code +
-- schema cleanup. Per the "Notion goes away entirely; HQ is master of truth"
-- direction locked 2026-05-26.
--
-- Audited state (2026-05-27, before this migration):
--   * Live Notion-related schema:
--       - projects.notion_url (0 rows populated)
--       - document_source enum ('notion' | 'upload' | 'generated') — orphan,
--         only consumer was the `documents` table which was dropped in
--         20260425000001_sprint6_knowledge_hub.sql.
--   * No row exists in `integrations` for type='notion'.
--   * No populated notion_url / notion_page_id on any other table.
--
-- Therefore this migration is a pure cleanup — no data loss, no surprises.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE projects DROP COLUMN IF EXISTS notion_url;

DROP TYPE IF EXISTS document_source;

-- Remove 'notion' from integration_type enum. Postgres doesn't allow direct
-- removal of enum values, so the canonical idiom is: rename old, create new,
-- alter column type with USING cast, drop old. The integrations table is
-- empty in prod (verified 2026-05-27), so the USING cast has no rows to
-- convert — safe regardless.
ALTER TYPE integration_type RENAME TO integration_type_old;

CREATE TYPE integration_type AS ENUM (
  'claude', 'ms365', 'slack', 'github', 'stripe', 'tm_api'
);

ALTER TABLE integrations
  ALTER COLUMN type TYPE integration_type
  USING type::text::integration_type;

DROP TYPE integration_type_old;

COMMIT;

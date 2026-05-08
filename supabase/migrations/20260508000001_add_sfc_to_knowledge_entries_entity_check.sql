-- PR-A added 'sfc' to the entity_type enum (used by `entities` table) and to
-- the TypeScript ENTITIES_CONST, but missed the CHECK constraint on
-- knowledge_entries.entity (which is plain text, not the enum). As a result,
-- saving a knowledge entry tagged with the SFC entity would fail with a
-- constraint violation. This migration extends the constraint to match.

ALTER TABLE knowledge_entries DROP CONSTRAINT IF EXISTS knowledge_entries_entity_check;
ALTER TABLE knowledge_entries ADD CONSTRAINT knowledge_entries_entity_check
  CHECK (entity = ANY (ARRAY['tm'::text, 'sf'::text, 'sfe'::text, 'sfc'::text, 'personal'::text]));

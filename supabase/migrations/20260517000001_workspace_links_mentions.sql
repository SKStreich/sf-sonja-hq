-- Sprint 10c Slice 2 — Workspace pages: [[...]] mentions + backlinks
--
-- 1. Extend knowledge_links to also target projects (not just other entries),
--    so [[Project: Name]] mentions persist alongside [[Entry: Title]] ones.
-- 2. Add 'mentions' relation for inline [[...]] references.
-- 3. Reconcile the relation check constraint with relation values the live
--    code already inserts ('critique_of', 'note_on', 'superseded_by') that
--    drifted from the committed migration (the "MCP apply_migration != .sql"
--    gotcha). Without this, fresh-environment bootstraps reject those inserts.

-- ── relax to_entry NOT NULL (project-target rows have to_entry IS NULL) ─────
ALTER TABLE knowledge_links ALTER COLUMN to_entry DROP NOT NULL;

-- ── new target column for project mentions ─────────────────────────────────
ALTER TABLE knowledge_links
  ADD COLUMN IF NOT EXISTS to_project UUID REFERENCES projects(id) ON DELETE CASCADE;

-- ── relation check: reconcile drift + add 'mentions' ───────────────────────
ALTER TABLE knowledge_links DROP CONSTRAINT IF EXISTS knowledge_links_relation_check;
ALTER TABLE knowledge_links ADD CONSTRAINT knowledge_links_relation_check
  CHECK (relation = ANY (ARRAY[
    'cites','duplicate_of','extends','chat_about','merged_into',
    'critique_of','note_on','superseded_by','mentions'
  ]));

-- ── exactly one target: to_entry XOR to_project ────────────────────────────
ALTER TABLE knowledge_links DROP CONSTRAINT IF EXISTS knowledge_links_target_xor;
ALTER TABLE knowledge_links ADD CONSTRAINT knowledge_links_target_xor
  CHECK ((to_entry IS NOT NULL) <> (to_project IS NOT NULL));

-- ── indexes + uniqueness for project links ─────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kl_to_project
  ON knowledge_links (to_project) WHERE to_project IS NOT NULL;

-- Partial unique for project-target rows (NULL handling on the existing
-- UNIQUE (from_entry, to_entry, relation) won't enforce this case).
CREATE UNIQUE INDEX IF NOT EXISTS kl_unique_project
  ON knowledge_links (from_entry, to_project, relation)
  WHERE to_project IS NOT NULL;

-- ── RLS: allow project-targeted rows on the same from_entry policies ───────
-- The existing kl_read / kl_write / kl_delete policies key off from_entry only,
-- so they already permit project-targeted rows. No policy change needed.

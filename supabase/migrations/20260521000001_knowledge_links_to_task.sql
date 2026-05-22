-- Sprint 10c Slice 3c — Workspace pages can mention tasks via [[Task: title]].
--
-- Adds a third target column (to_task) on knowledge_links and relaxes the
-- existing two-target XOR constraint into a three-target "exactly one"
-- constraint. Mirrors the to_project addition from 20260517000001:
--   * partial index for backlink lookups,
--   * partial unique index keyed on (from_entry, to_task, relation),
--   * existing RLS policies key off from_entry only, so no policy change.

-- ── new target column for task mentions ────────────────────────────────────
ALTER TABLE knowledge_links
  ADD COLUMN IF NOT EXISTS to_task UUID REFERENCES tasks(id) ON DELETE CASCADE;

-- ── exactly one target: to_entry XOR to_project XOR to_task ────────────────
-- The original 2-target XOR (`A <> B`) doesn't generalize to 3 — switch to
-- the sum-of-NOT-NULLs = 1 idiom.
ALTER TABLE knowledge_links DROP CONSTRAINT IF EXISTS knowledge_links_target_xor;
ALTER TABLE knowledge_links ADD CONSTRAINT knowledge_links_target_xor
  CHECK (
    (
      (to_entry   IS NOT NULL)::int
      + (to_project IS NOT NULL)::int
      + (to_task    IS NOT NULL)::int
    ) = 1
  );

-- ── indexes + uniqueness for task links ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_kl_to_task
  ON knowledge_links (to_task) WHERE to_task IS NOT NULL;

-- Partial unique for task-target rows. Mirrors kl_unique_project.
CREATE UNIQUE INDEX IF NOT EXISTS kl_unique_task
  ON knowledge_links (from_entry, to_task, relation)
  WHERE to_task IS NOT NULL;

-- Sprint 13 · Inbox & Triage — T3 (external lineage + bulk import).
-- Records where an imported entry came from so re-runs are non-destructive:
-- an importer refreshes external_last_edited_at on a known ref but NEVER
-- overwrites the human's triage (triage_status / entities) once filed.
-- All nullable — only imported rows carry lineage; manual/quick-capture rows don't.
ALTER TABLE knowledge_entries
  ADD COLUMN IF NOT EXISTS external_source TEXT,
  ADD COLUMN IF NOT EXISTS external_ref TEXT,
  ADD COLUMN IF NOT EXISTS external_last_edited_at TIMESTAMPTZ;

-- One row per (org, source, ref) — dedupes re-imports of the same item.
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_entries_external_ref_idx
  ON knowledge_entries (org_id, external_source, external_ref)
  WHERE external_ref IS NOT NULL;

-- Sprint 13 · Inbox & Triage — T1 substrate.
-- Adds a triage lifecycle separate from `status` (active/archived).
-- Spec: docs/specs/hq_inbox-triage_v1.html (LOCKED 2026-06-24), §4 Data model.
--
-- D1 (locked): exactly two states — `inbox` (needs filing) / `filed` (has a home).
-- Default `filed` so every existing row + every deliberate create stays out of
-- the inbox; only the auto-routed quick-capture paths (T2) will set `inbox`.
-- No new RLS — the column rides the existing knowledge_entries policies.

ALTER TABLE knowledge_entries
  ADD COLUMN IF NOT EXISTS triage_status TEXT NOT NULL DEFAULT 'filed'
  CHECK (triage_status IN ('inbox', 'filed'));

-- Partial index for the inbox-queue read — a small, hot subset of the table.
CREATE INDEX IF NOT EXISTS knowledge_entries_inbox_idx
  ON knowledge_entries (org_id, created_at DESC)
  WHERE triage_status = 'inbox';

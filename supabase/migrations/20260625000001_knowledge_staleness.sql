-- Sprint 13 · Staleness model (concept #1 of HQ Knowledge ae15bcf5).
-- Gives every knowledge entry a notion of "is this still trustworthy?" so HQ
-- doesn't silently rot once it's the source of truth.
--
-- staleness_days  — review cadence in days. 60 = the sensible default; 0 means
--                   "never goes stale" (foundational primers / CLAUDE.md-style
--                   references). Per-entry editable in the UI.
-- last_reviewed_at — when the human last vouched for the entry ("Mark as
--                    reviewed"). NULL = never explicitly reviewed; the staleness
--                    computation then ages the entry from its created_at
--                    (COALESCE(last_reviewed_at, created_at) is the baseline).
--
-- "Stale" is a *computed* condition, not a stored status: an entry is stale when
--   staleness_days > 0 AND now() - COALESCE(last_reviewed_at, created_at)
--     > staleness_days days.
-- The formula lives once in src/lib/knowledge/staleness.ts (unit-tested) and is
-- evaluated in app code for the EntryDetail badge, the 🕓 stale hub filter, and
-- the dashboard "to review" chip — so there's no SQL/JS drift to keep in sync.
-- No new column or index is needed for the status itself; the read set ("filed,
-- active, standard") is the same small slice the feed already scans.
--
-- No new RLS — both columns ride the existing knowledge_entries policies.

ALTER TABLE knowledge_entries
  ADD COLUMN IF NOT EXISTS staleness_days INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMPTZ;

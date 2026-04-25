-- Sprint 3 — Idea Library retrofit on captures table
-- Adds lifecycle status for captures of type='idea' (Raw → Developing → Approved → Shipped · Parked)

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS idea_status TEXT
    CHECK (idea_status IN ('raw', 'developing', 'approved', 'shipped', 'parked'))
    DEFAULT 'raw';

ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS title TEXT;

-- Partial index: status column only meaningful for ideas
CREATE INDEX IF NOT EXISTS idx_captures_idea_status
  ON captures (user_id, idea_status)
  WHERE type = 'idea';

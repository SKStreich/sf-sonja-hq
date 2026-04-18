-- Migration: 20260417_002_sprint2_captures_focus
-- Sprint 2 — captures + focus_notes tables with RLS

CREATE TABLE IF NOT EXISTS captures (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL CHECK (type IN ('idea', 'task')),
  content         TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  entity_context  TEXT,
  reviewed        BOOLEAN NOT NULL DEFAULT FALSE,
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_captures_user_created ON captures (user_id, created_at DESC);
CREATE INDEX idx_captures_unreviewed ON captures (user_id, reviewed) WHERE reviewed = FALSE;

ALTER TABLE captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY "captures_owner_all" ON captures
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS focus_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  archived    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_focus_notes_active ON focus_notes (user_id, archived) WHERE archived = FALSE;

ALTER TABLE focus_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "focus_notes_owner_all" ON focus_notes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

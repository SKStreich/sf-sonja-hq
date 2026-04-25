-- Sprint 10b — Duplicate resolution
-- Records pairs the user explicitly marked as "not a duplicate" so they stop
-- appearing in the Possible Duplicates panel. Pair ids stored in canonical
-- order (entry_a_id < entry_b_id) so the unique constraint catches both
-- (a,b) and (b,a) submissions.

CREATE TABLE IF NOT EXISTS knowledge_duplicate_dismissals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entry_a_id  UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  entry_b_id  UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  dismissed_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dismissed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (entry_a_id < entry_b_id),
  UNIQUE (org_id, entry_a_id, entry_b_id)
);

CREATE INDEX IF NOT EXISTS idx_kdd_org ON knowledge_duplicate_dismissals (org_id);

ALTER TABLE knowledge_duplicate_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY kdd_read ON knowledge_duplicate_dismissals
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY kdd_insert ON knowledge_duplicate_dismissals
  FOR INSERT WITH CHECK (
    dismissed_by = auth.uid()
    AND org_id IN (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY kdd_delete ON knowledge_duplicate_dismissals
  FOR DELETE USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  );

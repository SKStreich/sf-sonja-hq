-- Sprint 9 — Secure share links
-- Replaces a legacy knowledge_shares table (incompatible columns: item_id /
-- share_token / revoked) with the new schema bound to knowledge_entries.
-- Also extends knowledge_versions with rendered_html / mime_type / storage_path
-- so a "lock to current version" share can pin the original-view fidelity.

DROP TABLE IF EXISTS knowledge_shares CASCADE;

ALTER TABLE knowledge_versions
  ADD COLUMN IF NOT EXISTS rendered_html TEXT,
  ADD COLUMN IF NOT EXISTS mime_type     TEXT,
  ADD COLUMN IF NOT EXISTS storage_path  TEXT;

CREATE TABLE knowledge_shares (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  entry_id        UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  version_id      UUID REFERENCES knowledge_versions(id) ON DELETE SET NULL,
  token           TEXT NOT NULL UNIQUE,
  recipient_name  TEXT NOT NULL,
  recipient_email TEXT NOT NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  revoked_at      TIMESTAMPTZ,
  created_by      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ks_token ON knowledge_shares (token);
CREATE INDEX idx_ks_entry ON knowledge_shares (entry_id, created_at DESC);
CREATE INDEX idx_ks_creator ON knowledge_shares (created_by, created_at DESC);

ALTER TABLE knowledge_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY ks_read ON knowledge_shares
  FOR SELECT USING (
    created_by = auth.uid()
    OR org_id IN (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY ks_insert ON knowledge_shares
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND entry_id IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid())
  );

CREATE POLICY ks_update ON knowledge_shares
  FOR UPDATE USING (created_by = auth.uid());

CREATE POLICY ks_delete ON knowledge_shares
  FOR DELETE USING (created_by = auth.uid());

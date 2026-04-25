-- Sprint 10b — Contacts module + share forwarding requests
--
-- Contacts: org-wide CRM seed (every member of the org sees every contact;
--   created_by preserved for provenance; email unique per org). Auto-created
--   when a knowledge_share is sent; consent_to_contact stays false until the
--   recipient opts in via the share viewer.
--
-- share_forwarding_requests: when a recipient asks to forward their share to
--   someone new, a row is inserted. Owner approves → fresh share token minted
--   for the new recipient + Resend email sent.

CREATE TABLE IF NOT EXISTS contacts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT,
  company             TEXT,
  role                TEXT,
  tags                TEXT[] NOT NULL DEFAULT '{}',
  notes               TEXT,
  consent_to_contact  BOOLEAN NOT NULL DEFAULT FALSE,
  consent_at          TIMESTAMPTZ,
  source              TEXT,                                  -- 'share' | 'manual' | 'import'
  created_by          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_contacts_org_updated ON contacts (org_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_tags        ON contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_contacts_email_trgm  ON contacts USING GIN (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_contacts_name_trgm   ON contacts USING GIN (full_name gin_trgm_ops);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contacts_read ON contacts
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY contacts_insert ON contacts
  FOR INSERT WITH CHECK (
    created_by = auth.uid()
    AND org_id IN (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY contacts_update ON contacts
  FOR UPDATE USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY contacts_delete ON contacts
  FOR DELETE USING (
    created_by = auth.uid()
    OR org_id IN (
      SELECT org_id FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin')
    )
  );

CREATE TABLE IF NOT EXISTS share_forwarding_requests (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  share_id              UUID NOT NULL REFERENCES knowledge_shares(id) ON DELETE CASCADE,
  requested_by_email    TEXT NOT NULL,
  new_recipient_name    TEXT NOT NULL,
  new_recipient_email   TEXT NOT NULL,
  reason                TEXT,
  status                TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','approved','denied')),
  new_share_id          UUID REFERENCES knowledge_shares(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_at            TIMESTAMPTZ,
  decided_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_sfr_share ON share_forwarding_requests (share_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sfr_org_status ON share_forwarding_requests (org_id, status, created_at DESC);

ALTER TABLE share_forwarding_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY sfr_read ON share_forwarding_requests
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY sfr_insert ON share_forwarding_requests
  FOR INSERT WITH CHECK (
    org_id IN (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY sfr_update ON share_forwarding_requests
  FOR UPDATE USING (
    share_id IN (SELECT id FROM knowledge_shares WHERE created_by = auth.uid())
    OR org_id IN (
      SELECT org_id FROM user_profiles WHERE id = auth.uid() AND role IN ('owner','admin')
    )
  );

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS contacts_set_updated_at ON contacts;
CREATE TRIGGER contacts_set_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

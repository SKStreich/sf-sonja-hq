-- Create org_invitations if it doesn't already exist, then enforce RLS.
-- On prod the table was created ad-hoc via the admin client before a migration
-- was written; this makes the schema explicit and idempotent for fresh resets.

CREATE TABLE IF NOT EXISTS org_invitations (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  role          user_role NOT NULL DEFAULT 'member',
  token         TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'expired')),
  invited_by    UUID NOT NULL REFERENCES auth.users(id),
  expires_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, email)
);
CREATE INDEX IF NOT EXISTS idx_org_invitations_org_id ON org_invitations(org_id);
CREATE INDEX IF NOT EXISTS idx_org_invitations_token  ON org_invitations(token);

ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_invitations_select" ON org_invitations;
DROP POLICY IF EXISTS "org_invitations_delete" ON org_invitations;
DROP POLICY IF EXISTS "org_invitations_update" ON org_invitations;
DROP POLICY IF EXISTS "org_invitations_insert" ON org_invitations;

-- Any authenticated member of the org can see invitations (so accept flow works)
CREATE POLICY "org_invitations_select" ON org_invitations
  FOR SELECT USING (org_id = get_my_org_id());

-- Only admins/owners can delete (revoke) invitations — enforced in app layer
CREATE POLICY "org_invitations_delete" ON org_invitations
  FOR DELETE USING (org_id = get_my_org_id());

-- Allow update so accept flow can mark status = 'accepted'
CREATE POLICY "org_invitations_update" ON org_invitations
  FOR UPDATE USING (org_id = get_my_org_id());

-- Admin-client inserts (used for invite creation) run as service role, so no
-- policy needed for insert — left explicit for clarity.
CREATE POLICY "org_invitations_insert" ON org_invitations
  FOR INSERT WITH CHECK (org_id = get_my_org_id());

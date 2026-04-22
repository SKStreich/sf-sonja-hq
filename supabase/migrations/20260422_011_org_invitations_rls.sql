-- Fix RLS on org_invitations so admins can read/manage their org's invitations.
-- The table was created via admin client upsert; this adds the missing SELECT/DELETE/UPDATE policies.

ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_invitations_select" ON org_invitations;
DROP POLICY IF EXISTS "org_invitations_delete" ON org_invitations;
DROP POLICY IF EXISTS "org_invitations_update" ON org_invitations;

-- Any authenticated member of the org can see invitations (so accept flow works)
CREATE POLICY "org_invitations_select" ON org_invitations
  FOR SELECT USING (org_id = get_my_org_id());

-- Only admins/owners can delete (revoke) invitations — enforced in app layer
CREATE POLICY "org_invitations_delete" ON org_invitations
  FOR DELETE USING (org_id = get_my_org_id());

-- Allow update so accept flow can mark status = 'accepted'
CREATE POLICY "org_invitations_update" ON org_invitations
  FOR UPDATE USING (org_id = get_my_org_id());

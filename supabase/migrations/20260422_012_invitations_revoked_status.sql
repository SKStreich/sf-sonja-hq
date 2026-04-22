-- Allow 'revoked' as a valid status on org_invitations.
-- The original table likely has a check constraint for pending/accepted/expired only.

ALTER TABLE org_invitations DROP CONSTRAINT IF EXISTS org_invitations_status_check;

ALTER TABLE org_invitations
  ADD CONSTRAINT org_invitations_status_check
  CHECK (status IN ('pending', 'accepted', 'expired', 'revoked'));

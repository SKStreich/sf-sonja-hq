-- Add accepted_at column to org_invitations if it doesn't already exist.
-- This column was referenced in queries but never explicitly migrated.

ALTER TABLE org_invitations
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

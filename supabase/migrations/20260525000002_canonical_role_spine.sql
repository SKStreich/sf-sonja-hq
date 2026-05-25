-- ─────────────────────────────────────────────────────────────────────────────
-- Canonical 5-role spine — cross-project audit action 5 (HQ side).
--
--   owner  → platform_owner   (rename, same role)
--   admin  → org_admin        (rename, same role)
--   NEW    → supervisor       (real semantic — see spec v2 §3 cutline)
--   member → member           (unchanged)
--   read_only → read_only     (unchanged)
--
-- Notes:
--   * ALTER TYPE … RENAME VALUE updates the enum in place — no data rewrite,
--     all existing user_profiles rows automatically reflect the new label.
--   * ALTER TYPE … ADD VALUE is allowed inside a TX on PG 13+, but the new
--     value cannot be USED until the TX commits. This migration only
--     references the already-existing (post-rename) values in the policy
--     bodies, so a single-TX migration is safe on PG 17.
--   * Three RLS policies hard-coded the old IN ('owner','admin') tuple and
--     must be DROP+RECREATEd: integrations_admin_only, contacts_delete,
--     sfr_update.
--
-- Spec: docs/specs/hq_auth-and-roles_v2.html
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Step 1 — rename existing values.
ALTER TYPE user_role RENAME VALUE 'owner' TO 'platform_owner';
ALTER TYPE user_role RENAME VALUE 'admin' TO 'org_admin';

-- Step 2 — add supervisor between org_admin and member.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'supervisor' AFTER 'org_admin';

-- Step 3 — refresh policies whose bodies reference the old string literals.
DROP POLICY IF EXISTS "integrations_admin_only" ON integrations;
CREATE POLICY "integrations_admin_only" ON integrations FOR ALL
  USING (
    org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid()
        AND role IN ('platform_owner', 'org_admin')
    )
  );

DROP POLICY IF EXISTS contacts_delete ON contacts;
CREATE POLICY contacts_delete ON contacts
  FOR DELETE USING (
    created_by = auth.uid()
    OR org_id IN (
      SELECT org_id FROM user_profiles WHERE id = auth.uid() AND role IN ('platform_owner','org_admin')
    )
  );

DROP POLICY IF EXISTS sfr_update ON share_forwarding_requests;
CREATE POLICY sfr_update ON share_forwarding_requests
  FOR UPDATE USING (
    share_id IN (SELECT id FROM knowledge_shares WHERE created_by = auth.uid())
    OR org_id IN (
      SELECT org_id FROM user_profiles WHERE id = auth.uid() AND role IN ('platform_owner','org_admin')
    )
  );

COMMIT;

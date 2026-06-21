-- ─────────────────────────────────────────────────────────────────────────────
-- Widen knowledge_entries DELETE so platform_owner / org_admin can delete ANY
-- entry in their org — not just entries they personally authored.
--
-- Background: the original sprint6 policy was
--   CREATE POLICY ke_delete ON knowledge_entries
--     FOR DELETE USING (user_id = auth.uid());
-- i.e. self-delete only. Entries created by another account (e.g. a member, or
-- an upload authenticated with a non-owner key) match 0 rows under this policy,
-- so the DELETE returns success with no error and the row silently survives —
-- the UI reports "deleted" but the entry stays. The canonical-role-spine
-- migration (20260525000002) fixed this same class of gap for contacts_delete,
-- integrations, and share_forwarding_requests, but ke_delete was not in scope
-- (it referenced user_id, not the old enum literals, so it wasn't flagged).
--
-- This brings ke_delete in line with the established contacts_delete pattern:
-- members keep self-delete; owners/admins can manage all org content.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DROP POLICY IF EXISTS ke_delete ON knowledge_entries;
CREATE POLICY ke_delete ON knowledge_entries
  FOR DELETE USING (
    user_id = auth.uid()
    OR org_id IN (
      SELECT org_id FROM user_profiles
      WHERE id = auth.uid() AND role IN ('platform_owner', 'org_admin')
    )
  );

COMMIT;

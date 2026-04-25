-- resource_usage table already created in 20260418_003_sprint3_pm_collaboration_cost.sql
-- This migration adds source column + user policies for manual entries

ALTER TABLE resource_usage
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','auto','api_sync'));

DROP POLICY IF EXISTS "resource_usage_user_insert" ON resource_usage;
CREATE POLICY "resource_usage_user_insert"
  ON resource_usage FOR INSERT
  WITH CHECK (org_id = get_my_org_id() AND source = 'manual');

DROP POLICY IF EXISTS "resource_usage_user_delete" ON resource_usage;
CREATE POLICY "resource_usage_user_delete"
  ON resource_usage FOR DELETE
  USING (org_id = get_my_org_id() AND source = 'manual');

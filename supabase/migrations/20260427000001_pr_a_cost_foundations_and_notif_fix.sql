-- PR-A part 1 — cost-tracking foundations + notifications constraint fix
--
-- 1) Adds 'sfc' to entity_type enum (used in part 2 to insert SF-Containers).
-- 2) Extends notifications.type and entity_type check constraints so
--    submitForwardRequest can insert 'share_forward_request' rows. Earlier
--    inserts were silently rejected by the original constraints, leaving the
--    bell empty after a forward submission.
-- 3) Adds entity_id to resource_usage so per-entity cost rollups work
--    (Streich Force Solutions / Enterprises / Containers / Personal; TM
--    intentionally tracked separately later).
-- 4) Adds subscription/connection columns to service_configs so the new
--    Connections settings page can capture monthly fees, billing anchor day,
--    API-key env-var name, display name, and operator notes.

ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'sfc';

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY[
    'assignment','update','due_date','mention','invite','comment',
    'share_forward_request'
  ]));

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_entity_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_entity_type_check
  CHECK (entity_type = ANY (ARRAY[
    'project','task','capture',
    'share_forwarding_request','knowledge_share','knowledge_entry'
  ]));

ALTER TABLE resource_usage
  ADD COLUMN IF NOT EXISTS entity_id UUID REFERENCES entities(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_resource_usage_entity ON resource_usage (entity_id, created_at DESC);

-- service_configs was originally created out-of-band (an MCP apply_migration
-- that was never committed as a migration file), so a clean replay reached the
-- ALTER below with no table to alter. Recreate the base table here (idempotent)
-- so fresh environments match prod. On prod this migration is already recorded
-- as applied and will not re-run; IF NOT EXISTS / DROP-then-CREATE keep a manual
-- re-run a no-op. The ALTER below then adds the subscription columns.
CREATE TABLE IF NOT EXISTS service_configs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  service          TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'active',
  last_activity_at TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ DEFAULT now(),
  UNIQUE (org_id, service)
);
ALTER TABLE service_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_configs_all ON service_configs;
CREATE POLICY service_configs_all ON service_configs
  FOR ALL USING (org_id = get_my_org_id());
DROP POLICY IF EXISTS service_configs_select ON service_configs;
CREATE POLICY service_configs_select ON service_configs
  FOR SELECT USING (org_id = get_my_org_id());

ALTER TABLE service_configs
  ADD COLUMN IF NOT EXISTS monthly_fee_usd      NUMERIC(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS billing_anchor_day   INT,                     -- day of month the bill resets, 1-28
  ADD COLUMN IF NOT EXISTS api_key_env_name     TEXT,                    -- e.g. 'OPENAI_API_KEY'
  ADD COLUMN IF NOT EXISTS display_name         TEXT,
  ADD COLUMN IF NOT EXISTS notes                TEXT;

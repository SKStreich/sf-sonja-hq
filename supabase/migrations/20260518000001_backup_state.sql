-- DR Standard tier — Cloudflare R2 bucket backup state tracking.
--
-- One row per Supabase Storage bucket we mirror. Updated by
-- /api/cron/backup-buckets after each run so the Connections page can
-- surface "last backed up at" / errors.

CREATE TABLE IF NOT EXISTS backup_state (
  bucket_name              TEXT PRIMARY KEY,
  last_run_started_at      TIMESTAMPTZ,
  last_run_completed_at    TIMESTAMPTZ,
  last_run_status          TEXT
    CHECK (last_run_status IS NULL OR last_run_status = ANY (ARRAY['success','partial','error'])),
  last_run_error           TEXT,
  objects_synced_total     BIGINT NOT NULL DEFAULT 0,
  objects_synced_last_run  BIGINT NOT NULL DEFAULT 0,
  objects_skipped_last_run BIGINT NOT NULL DEFAULT 0,
  bytes_synced_last_run    BIGINT NOT NULL DEFAULT 0,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE backup_state ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user. We could scope to admin role later; for now
-- the data is just stats, not credentials.
CREATE POLICY backup_state_read ON backup_state
  FOR SELECT TO authenticated USING (true);

-- Write: only the service role (used by the cron). RLS denies authenticated
-- users by default since we don't define INSERT/UPDATE/DELETE policies.

-- Seed the three buckets we mirror. Idempotent.
INSERT INTO backup_state (bucket_name) VALUES
  ('knowledge'),
  ('vault'),
  ('project-files')
ON CONFLICT (bucket_name) DO NOTHING;

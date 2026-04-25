-- Sprint 5 — Tier 2 Vault
-- Claude-inaccessible storage for government IDs, health records, financial docs, sensitive legal.
-- Rules (spec §Two-Tier Security):
--   * Claude never reads any vault row or bucket object.
--   * Never shareable via link. Never passed to the Claude API.
--   * Direct signed URL to the owner only.

-- ── vault_files metadata table ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vault_files (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path  TEXT NOT NULL UNIQUE,
  filename      TEXT NOT NULL,
  mime_type     TEXT,
  size_bytes    BIGINT,
  category      TEXT NOT NULL CHECK (category IN ('id', 'health', 'financial', 'legal', 'other')),
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_files_user ON vault_files (user_id, created_at DESC);

ALTER TABLE vault_files ENABLE ROW LEVEL SECURITY;

-- Owner-only: strictly user_id = auth.uid(). No shares. No admin overrides.
CREATE POLICY vault_files_owner_select ON vault_files
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY vault_files_owner_insert ON vault_files
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY vault_files_owner_update ON vault_files
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY vault_files_owner_delete ON vault_files
  FOR DELETE USING (user_id = auth.uid());

-- ── vault storage bucket ──────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('vault', 'vault', FALSE)
  ON CONFLICT (id) DO NOTHING;

-- Objects in the 'vault' bucket: only the file owner (path prefix = user_id)
-- can read, upload, update, or delete. Never public. Never shareable.
DROP POLICY IF EXISTS vault_objects_owner_select ON storage.objects;
DROP POLICY IF EXISTS vault_objects_owner_insert ON storage.objects;
DROP POLICY IF EXISTS vault_objects_owner_update ON storage.objects;
DROP POLICY IF EXISTS vault_objects_owner_delete ON storage.objects;

CREATE POLICY vault_objects_owner_select ON storage.objects
  FOR SELECT USING (
    bucket_id = 'vault'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY vault_objects_owner_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'vault'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY vault_objects_owner_update ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'vault'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY vault_objects_owner_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'vault'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

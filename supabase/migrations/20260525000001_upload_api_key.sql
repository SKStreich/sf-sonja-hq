-- Action 11: external upload API key for HQ → knowledge_entries POST endpoint.
-- Mirrors the capture_api_key pattern (Siri Shortcuts) but kept on a separate
-- column so capture and upload have independent blast radius: if one token
-- leaks, the other surface is unaffected.
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS upload_api_key UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_upload_api_key
  ON user_profiles(upload_api_key);

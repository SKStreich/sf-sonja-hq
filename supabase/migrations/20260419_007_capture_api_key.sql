-- Personal capture API key for Siri Shortcuts / external capture
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS capture_api_key UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profiles_capture_api_key
  ON user_profiles(capture_api_key);

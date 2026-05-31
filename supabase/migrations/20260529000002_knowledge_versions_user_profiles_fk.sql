-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: knowledge entry detail page returned 500 on every page load.
--
-- Root cause: src/app/api/knowledge/detail.ts::listVersions() uses PostgREST's
-- embedded-resource syntax `user_profiles:created_by(full_name, email)` to
-- join versions to their authors. The query requires a FK constraint between
-- knowledge_versions.created_by and user_profiles.id for PostgREST to infer
-- the relationship.
--
-- The existing FK on knowledge_versions.created_by pointed to auth.users(id),
-- not user_profiles(id), so PostgREST returned PGRST200:
--   "Could not find a relationship between 'knowledge_versions' and
--    'created_by' in the schema cache"
--
-- Result: every /dashboard/knowledge/[id] open threw a server-side exception
-- (Digest: 1084454066). Pre-existing since the knowledge_versions table got
-- its current entry_id/created_by shape — affected all 27 knowledge entries.
--
-- Fix: add a parallel FK to user_profiles. Leaves the auth.users FK in place
-- (user_profiles.id IS the auth.users.id via the profile-row pattern, so both
-- FKs reference the same value).
--
-- Verified safe: 10 version rows in prod, 0 orphans against user_profiles.
-- NOTIFY pgrst already issued via the MCP apply call; this file is the
-- source-of-truth record.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE knowledge_versions
  ADD CONSTRAINT knowledge_versions_created_by_user_profiles_fkey
  FOREIGN KEY (created_by) REFERENCES user_profiles(id) ON DELETE SET NULL;

-- Sprint 14 · Daily Journal — J1 substrate.
-- Spec: docs/specs/hq_journal_v1.html (LOCKED 2026-07-13), §3 Data model.
--
-- One markdown page per user per day (D1). RLS is OWNER-ONLY (OQ-1): a diary
-- is per-person even inside an org, so the policy is stricter than the usual
-- org-wide get_my_org_id() scope. journal_append implements D8: captures
-- append via DB-side concat, never read-modify-write, so a phone capture (J3)
-- can never clobber an open web editor's save.

BEGIN;

CREATE TABLE IF NOT EXISTS journal_days (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_date  DATE NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (org_id, user_id, entry_date)
);
CREATE INDEX IF NOT EXISTS idx_journal_days_user_date ON journal_days (user_id, entry_date DESC);

CREATE TRIGGER journal_days_updated_at BEFORE UPDATE ON journal_days
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

ALTER TABLE journal_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY journal_days_all ON journal_days FOR ALL
  USING (user_id = auth.uid() AND org_id = get_my_org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = get_my_org_id());

-- D8 append: upsert + SQL-side concat. SECURITY INVOKER — rides the calling
-- user's owner-only RLS, so it can only ever touch the caller's own page.
-- (The J3 Siri path authenticates via capture_api_key on an admin client and
-- will supply org/user explicitly there; this RPC serves authed sessions.)
CREATE OR REPLACE FUNCTION journal_append(p_entry_date DATE, p_chunk TEXT)
RETURNS void
LANGUAGE sql
AS $$
  INSERT INTO journal_days (org_id, user_id, entry_date, body)
  VALUES (get_my_org_id(), auth.uid(), p_entry_date, p_chunk)
  ON CONFLICT (org_id, user_id, entry_date)
  DO UPDATE SET body = COALESCE(journal_days.body, '') || p_chunk;
$$;

COMMIT;

-- Sprint 6 — Unified Knowledge Hub
-- DESTRUCTIVE: drops the fragmented tables (ideas/captures/documents/chat_history/
-- knowledge_items/knowledge_versions/knowledge_shares/vault_files) and replaces
-- them with a single knowledge_entries table plus focused supporting tables.
-- All existing data is considered test data and will be lost.

-- Required extension for trigram similarity search.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── drop legacy tables ───────────────────────────────────────────────────────
DROP TABLE IF EXISTS knowledge_shares     CASCADE;
DROP TABLE IF EXISTS knowledge_versions   CASCADE;
DROP TABLE IF EXISTS knowledge_items      CASCADE;
DROP TABLE IF EXISTS vault_files          CASCADE;
DROP TABLE IF EXISTS captures             CASCADE;
DROP TABLE IF EXISTS documents            CASCADE;
DROP TABLE IF EXISTS chat_history         CASCADE;
DROP TABLE IF EXISTS ideas                CASCADE;

-- legacy storage policies on vault bucket (recreated below with same intent)
DROP POLICY IF EXISTS vault_objects_owner_select ON storage.objects;
DROP POLICY IF EXISTS vault_objects_owner_insert ON storage.objects;
DROP POLICY IF EXISTS vault_objects_owner_update ON storage.objects;
DROP POLICY IF EXISTS vault_objects_owner_delete ON storage.objects;

-- ── knowledge_entries ────────────────────────────────────────────────────────
-- Single source of truth for ideas, docs, chats, vault files, and freeform notes.
-- The `access` column gates Tier-2 behavior (Claude never reads access='vault' rows).
CREATE TABLE knowledge_entries (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                     UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id                    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind                       TEXT NOT NULL CHECK (kind IN ('idea','doc','chat','vault','note')),
  access                     TEXT NOT NULL DEFAULT 'standard' CHECK (access IN ('standard','vault')),
  entity                     TEXT NOT NULL CHECK (entity IN ('tm','sf','sfe','personal')),
  title                      TEXT,
  body                       TEXT,
  summary                    TEXT,                -- AI-generated preview
  type_hint                  TEXT CHECK (type_hint IN ('decision','strategy','primer','brand','marketing','business','idea') OR type_hint IS NULL),
  idea_status                TEXT CHECK (idea_status IN ('raw','developing','approved','shipped','parked') OR idea_status IS NULL),
  status                     TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  tags                       TEXT[] NOT NULL DEFAULT '{}',
  source                     TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','notion_import','chat_extraction','upload','voice_capture')),
  source_ref                 TEXT,
  storage_path               TEXT UNIQUE,         -- vault+attachment uploads
  mime_type                  TEXT,
  size_bytes                 BIGINT,
  confidence                 NUMERIC,
  classification_overridden  BOOLEAN NOT NULL DEFAULT FALSE,
  promoted_to_type           TEXT CHECK (promoted_to_type IN ('project','task') OR promoted_to_type IS NULL),
  promoted_to_id             UUID,
  promoted_at                TIMESTAMPTZ,
  version                    INT NOT NULL DEFAULT 1,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ke_org_kind_updated ON knowledge_entries (org_id, kind, updated_at DESC) WHERE status = 'active';
CREATE INDEX idx_ke_entity           ON knowledge_entries (org_id, entity, updated_at DESC) WHERE status = 'active';
CREATE INDEX idx_ke_user_access      ON knowledge_entries (user_id, access) WHERE access = 'vault';
CREATE INDEX idx_ke_idea_status      ON knowledge_entries (org_id, idea_status) WHERE kind = 'idea';
CREATE INDEX idx_ke_tags             ON knowledge_entries USING GIN (tags);
CREATE INDEX idx_ke_body_trgm        ON knowledge_entries USING GIN (body gin_trgm_ops) WHERE access = 'standard';
CREATE INDEX idx_ke_title_trgm       ON knowledge_entries USING GIN (title gin_trgm_ops) WHERE access = 'standard';

ALTER TABLE knowledge_entries ENABLE ROW LEVEL SECURITY;

-- ── knowledge_vault_grants ───────────────────────────────────────────────────
-- Explicit per-entry access list for Tier-2 entries. Owner always has access
-- implicitly; this table stores additional grants.
CREATE TABLE knowledge_vault_grants (
  entry_id     UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  grantee_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by   UUID NOT NULL REFERENCES auth.users(id),
  granted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entry_id, grantee_id)
);

ALTER TABLE knowledge_vault_grants ENABLE ROW LEVEL SECURITY;

-- knowledge_entries policies (declared here because ke_read references knowledge_vault_grants)
CREATE POLICY ke_read ON knowledge_entries
  FOR SELECT USING (
    CASE
      WHEN access = 'standard' THEN
        org_id IN (SELECT org_id FROM user_profiles WHERE id = auth.uid())
      ELSE
        user_id = auth.uid()
        OR id IN (SELECT entry_id FROM knowledge_vault_grants WHERE grantee_id = auth.uid())
    END
  );

CREATE POLICY ke_insert ON knowledge_entries
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND org_id IN (SELECT org_id FROM user_profiles WHERE id = auth.uid())
  );

CREATE POLICY ke_update ON knowledge_entries
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY ke_delete ON knowledge_entries
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY kvg_read ON knowledge_vault_grants
  FOR SELECT USING (
    grantee_id = auth.uid()
    OR granted_by = auth.uid()
    OR entry_id IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid())
  );
CREATE POLICY kvg_write ON knowledge_vault_grants
  FOR INSERT WITH CHECK (
    entry_id IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid() AND access = 'vault')
  );
CREATE POLICY kvg_delete ON knowledge_vault_grants
  FOR DELETE USING (
    entry_id IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid())
  );

-- ── knowledge_versions ───────────────────────────────────────────────────────
CREATE TABLE knowledge_versions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  version       INT NOT NULL,
  title         TEXT,
  body          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES auth.users(id),
  UNIQUE (entry_id, version)
);

CREATE INDEX idx_kv_entry ON knowledge_versions (entry_id, version DESC);

ALTER TABLE knowledge_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY kv_read ON knowledge_versions
  FOR SELECT USING (
    entry_id IN (SELECT id FROM knowledge_entries)   -- delegated to entries RLS
  );
CREATE POLICY kv_write ON knowledge_versions
  FOR INSERT WITH CHECK (
    entry_id IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid())
  );

-- ── knowledge_chats ──────────────────────────────────────────────────────────
-- Messages inside an AI conversation. Each conversation corresponds to a
-- kind='chat' entry. If the user converses about an existing entry, a new
-- kind='chat' entry is created and linked via knowledge_links.
CREATE TABLE knowledge_chats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content       TEXT NOT NULL,
  token_count   INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_kc_entry ON knowledge_chats (entry_id, created_at ASC);

ALTER TABLE knowledge_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY kc_read ON knowledge_chats
  FOR SELECT USING (entry_id IN (SELECT id FROM knowledge_entries));
CREATE POLICY kc_write ON knowledge_chats
  FOR INSERT WITH CHECK (
    entry_id IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid())
  );

-- ── knowledge_links ──────────────────────────────────────────────────────────
-- Entry-to-entry references (idea cites doc, chat about entry X, duplicate of Y).
CREATE TABLE knowledge_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_entry    UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  to_entry      UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  relation      TEXT NOT NULL CHECK (relation IN ('cites','duplicate_of','extends','chat_about','merged_into')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES auth.users(id),
  UNIQUE (from_entry, to_entry, relation)
);

CREATE INDEX idx_kl_from ON knowledge_links (from_entry);
CREATE INDEX idx_kl_to   ON knowledge_links (to_entry);

ALTER TABLE knowledge_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY kl_read  ON knowledge_links FOR SELECT USING (from_entry IN (SELECT id FROM knowledge_entries));
CREATE POLICY kl_write ON knowledge_links FOR INSERT WITH CHECK (
  from_entry IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid())
);
CREATE POLICY kl_delete ON knowledge_links FOR DELETE USING (
  from_entry IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid())
);

-- ── knowledge_shares ─────────────────────────────────────────────────────────
-- Public share tokens. Vault entries are explicitly never shareable.
CREATE TABLE knowledge_shares (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id      UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  token         TEXT NOT NULL UNIQUE,
  created_by    UUID NOT NULL REFERENCES auth.users(id),
  recipient_email TEXT,
  expires_at    TIMESTAMPTZ,
  revoked       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ks_token ON knowledge_shares (token) WHERE NOT revoked;
CREATE INDEX idx_ks_entry ON knowledge_shares (entry_id, created_at DESC);

ALTER TABLE knowledge_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY ks_read  ON knowledge_shares FOR SELECT USING (entry_id IN (SELECT id FROM knowledge_entries));
CREATE POLICY ks_write ON knowledge_shares FOR INSERT WITH CHECK (
  created_by = auth.uid()
  AND entry_id IN (SELECT id FROM knowledge_entries WHERE user_id = auth.uid() AND access = 'standard')
);
CREATE POLICY ks_update ON knowledge_shares FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());

-- ── storage buckets ──────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('knowledge','knowledge',FALSE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public)
  VALUES ('vault','vault',FALSE)
  ON CONFLICT (id) DO NOTHING;

-- Standard knowledge attachments: any org member can read/write their own org's files.
-- Path pattern: <org_id>/<entry_id>/<uuid>-<filename>
CREATE POLICY knowledge_objects_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'knowledge'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_profiles WHERE id = auth.uid()
    )
  );
CREATE POLICY knowledge_objects_insert ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'knowledge'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_profiles WHERE id = auth.uid()
    )
  );
CREATE POLICY knowledge_objects_delete ON storage.objects
  FOR DELETE USING (
    bucket_id = 'knowledge'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM user_profiles WHERE id = auth.uid()
    )
  );

-- Vault objects: owner-only. Path pattern: <user_id>/<uuid>-<filename>
-- Grants do NOT extend to storage — grantees read via signed URLs minted by
-- the owner's server action. Keeps Tier-2 signed-URL-only invariant intact.
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

-- ── updated_at trigger ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_knowledge_entries_updated_at()
  RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END $$;

CREATE TRIGGER trg_ke_updated_at
  BEFORE UPDATE ON knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION touch_knowledge_entries_updated_at();

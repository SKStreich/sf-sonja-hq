-- Sprint 1 — Knowledge Base (Tier 1 tables + RLS)
-- Spec: docs/sonja-hq-spec.md "Knowledge Store — Full Data Model"
-- Decisions: D-003 (KB replaces Notion/OneDrive), D-004 (no folders), D-005 (two-tier security),
--            D-008 (sharing rules), D-009 (Document Library replaced by KB)

CREATE EXTENSION IF NOT EXISTS vector;

-- ── knowledge_items ────────────────────────────────────────────────────────
CREATE TABLE knowledge_items (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title                     TEXT,
  body                      TEXT NOT NULL,
  entity                    entity_type NOT NULL,
  type                      TEXT NOT NULL CHECK (type IN (
                              'decision','strategy','primer','brand','marketing','business','idea'
                            )),
  tags                      TEXT[] NOT NULL DEFAULT '{}',
  status                    TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('draft','active','archived')),
  confidence                REAL,
  classification_overridden BOOLEAN NOT NULL DEFAULT FALSE,
  overridden_by             UUID REFERENCES auth.users(id),
  version                   INTEGER NOT NULL DEFAULT 1,
  fts                       TSVECTOR GENERATED ALWAYS AS (
                              setweight(to_tsvector('english', coalesce(title,'')), 'A') ||
                              setweight(to_tsvector('english', coalesce(body,'')),  'B')
                            ) STORED,
  embedding                 VECTOR(1536),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_knowledge_items_user_id  ON knowledge_items(user_id);
CREATE INDEX idx_knowledge_items_entity   ON knowledge_items(entity);
CREATE INDEX idx_knowledge_items_type     ON knowledge_items(type);
CREATE INDEX idx_knowledge_items_status   ON knowledge_items(status);
CREATE INDEX idx_knowledge_items_fts      ON knowledge_items USING GIN (fts);
CREATE INDEX idx_knowledge_items_embedding
  ON knowledge_items USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE TRIGGER knowledge_items_updated_at
  BEFORE UPDATE ON knowledge_items
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- ── knowledge_versions ─────────────────────────────────────────────────────
CREATE TABLE knowledge_versions (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id        UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  version        INTEGER NOT NULL,
  body_snapshot  TEXT NOT NULL,
  diff           TEXT,
  changed_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (item_id, version)
);
CREATE INDEX idx_knowledge_versions_item_id ON knowledge_versions(item_id);

-- ── knowledge_shares ───────────────────────────────────────────────────────
CREATE TABLE knowledge_shares (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id          UUID NOT NULL REFERENCES knowledge_items(id) ON DELETE CASCADE,
  created_by       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_token      TEXT NOT NULL UNIQUE,
  recipient_email  TEXT,
  access_level     TEXT NOT NULL DEFAULT 'read' CHECK (access_level IN ('read')),
  expires_at       TIMESTAMPTZ,
  revoked          BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_knowledge_shares_item_id     ON knowledge_shares(item_id);
CREATE INDEX idx_knowledge_shares_created_by  ON knowledge_shares(created_by);
CREATE INDEX idx_knowledge_shares_token       ON knowledge_shares(share_token);

-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE knowledge_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_shares   ENABLE ROW LEVEL SECURITY;

-- knowledge_items: owner-only for authenticated access.
-- Public share-token reads are handled by a separate unauthenticated RPC
-- in a later sprint (keeps the owner policy tight and inspectable here).
CREATE POLICY knowledge_items_owner_select ON knowledge_items
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY knowledge_items_owner_insert ON knowledge_items
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY knowledge_items_owner_update ON knowledge_items
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY knowledge_items_owner_delete ON knowledge_items
  FOR DELETE USING (user_id = auth.uid());

-- knowledge_versions: readable/writable only if the underlying item is owned.
CREATE POLICY knowledge_versions_owner_select ON knowledge_versions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM knowledge_items i
            WHERE i.id = knowledge_versions.item_id AND i.user_id = auth.uid())
  );
CREATE POLICY knowledge_versions_owner_insert ON knowledge_versions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM knowledge_items i
            WHERE i.id = knowledge_versions.item_id AND i.user_id = auth.uid())
  );

-- knowledge_shares: only the creator of the share (and therefore item owner)
-- sees/edits their shares. Insert is gated by item ownership.
CREATE POLICY knowledge_shares_owner_select ON knowledge_shares
  FOR SELECT USING (created_by = auth.uid());
CREATE POLICY knowledge_shares_owner_insert ON knowledge_shares
  FOR INSERT WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM knowledge_items i
            WHERE i.id = knowledge_shares.item_id AND i.user_id = auth.uid())
  );
CREATE POLICY knowledge_shares_owner_update ON knowledge_shares
  FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY knowledge_shares_owner_delete ON knowledge_shares
  FOR DELETE USING (created_by = auth.uid());

-- Unified Knowledge Browser — containment graph + DB embeds + DB↔doc links (U3c)
--
-- Spec:   docs/specs/hq_knowledge-unified-browser_v1.html (LOCKED 2026-06-22;
--         HQ Knowledge a12667fd). OQ-1 generic node-link graph · OQ-3 inline
--         DB-on-page embeds. Plus extending knowledge_links to a DB target so a
--         doc/page can be deliberately linked to a database.
--
-- ADDITIVE ONLY. Two new org-scoped tables under the get_my_org_id() tenant
-- pattern (mirrors hq_databases / projects), and one widen of the existing
-- knowledge_links target XOR. Full FOR ALL policies installed up front so the
-- U3c server actions need no further RLS migration. Replay-safe: no seed data.

BEGIN;

-- ── knowledge_node_links — generic containment graph (OQ-1) ───────────────────
-- A parent PAGE (knowledge_entries, kind='workspace') contains children. A child
-- is either another entry (sub-page) or a database. child_id is polymorphic
-- (resolved by child_source) so there's no single FK — org_id is the RLS
-- boundary and an ON DELETE CASCADE on the parent keeps it tidy. The existing
-- knowledge_entries.parent_id stays the canonical page→sub-page edge; this table
-- adds the cross-type edges (page→database) and any extra graph links the tree
-- builder will consume in addition to parent_id.
CREATE TABLE IF NOT EXISTS knowledge_node_links (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  parent_id    UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  child_id     UUID NOT NULL,
  child_source TEXT NOT NULL CHECK (child_source = ANY (ARRAY['entry','database'])),
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (parent_id, child_id, child_source)
);
CREATE INDEX IF NOT EXISTS idx_knl_parent ON knowledge_node_links (parent_id, position);
CREATE INDEX IF NOT EXISTS idx_knl_child  ON knowledge_node_links (child_id);

ALTER TABLE knowledge_node_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_node_links_tenant ON knowledge_node_links FOR ALL
  USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- ── knowledge_db_embeds — inline database on a page (OQ-3) ─────────────────────
-- A database rendered inline within a page's body. view_config carries per-embed
-- display options (column subset, sort, …) as JSONB — empty {} renders the full
-- table. One embed per (page, database) pair.
CREATE TABLE IF NOT EXISTS knowledge_db_embeds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  host_entry_id UUID NOT NULL REFERENCES knowledge_entries(id) ON DELETE CASCADE,
  database_id   UUID NOT NULL REFERENCES hq_databases(id) ON DELETE CASCADE,
  view_config   JSONB NOT NULL DEFAULT '{}'::jsonb,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (host_entry_id, database_id)
);
CREATE INDEX IF NOT EXISTS idx_kde_host ON knowledge_db_embeds (host_entry_id, position);

ALTER TABLE knowledge_db_embeds ENABLE ROW LEVEL SECURITY;
CREATE POLICY knowledge_db_embeds_tenant ON knowledge_db_embeds FOR ALL
  USING (org_id = get_my_org_id())
  WITH CHECK (org_id = get_my_org_id());

-- ── knowledge_links → DB target (DB↔doc linking) ──────────────────────────────
-- Mirrors the to_project (20260517000001) / to_task (20260521000001) additions:
-- a fourth optional target column, the XOR widened to "exactly one of four",
-- plus an index + partial-unique. RLS keys off from_entry only, so no policy
-- change. 'attached' (the deliberate, user-driven relation) already exists.
ALTER TABLE knowledge_links
  ADD COLUMN IF NOT EXISTS to_database UUID REFERENCES hq_databases(id) ON DELETE CASCADE;

ALTER TABLE knowledge_links DROP CONSTRAINT IF EXISTS knowledge_links_target_xor;
ALTER TABLE knowledge_links ADD CONSTRAINT knowledge_links_target_xor
  CHECK (
    (
      (to_entry    IS NOT NULL)::int
      + (to_project  IS NOT NULL)::int
      + (to_task     IS NOT NULL)::int
      + (to_database IS NOT NULL)::int
    ) = 1
  );

CREATE INDEX IF NOT EXISTS idx_kl_to_database
  ON knowledge_links (to_database) WHERE to_database IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS kl_unique_database
  ON knowledge_links (from_entry, to_database, relation)
  WHERE to_database IS NOT NULL;

COMMIT;

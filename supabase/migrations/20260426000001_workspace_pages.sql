-- Sprint 10c Slice 1 — Workspace pages (Notion-style hierarchical Markdown)
-- New entry kind 'workspace' + parent_id for nesting.

ALTER TABLE knowledge_entries
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES knowledge_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ke_parent ON knowledge_entries (parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ke_workspace_tree ON knowledge_entries (org_id, parent_id, updated_at DESC) WHERE kind = 'workspace' AND status = 'active';

ALTER TABLE knowledge_entries DROP CONSTRAINT IF EXISTS knowledge_entries_kind_check;
ALTER TABLE knowledge_entries ADD CONSTRAINT knowledge_entries_kind_check
  CHECK (kind = ANY (ARRAY['idea','doc','chat','vault','note','critique','workspace']));

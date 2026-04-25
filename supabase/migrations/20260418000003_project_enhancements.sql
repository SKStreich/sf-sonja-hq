-- Rename Streich Force → Streich Force Solutions
UPDATE entities SET name = 'Streich Force Solutions' WHERE type = 'sf';

-- Next action enhancements on projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS next_action_type TEXT
    CHECK (next_action_type IN ('meeting','call','email','create_file','review','design','deploy','research','other')),
  ADD COLUMN IF NOT EXISTS next_action_due DATE;

-- Project updates / log
CREATE TABLE IF NOT EXISTS project_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id),
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  update_type TEXT NOT NULL DEFAULT 'note'
    CHECK (update_type IN ('note','progress','blocker','decision','milestone')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE project_updates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_updates_tenant_isolation" ON project_updates;
CREATE POLICY "project_updates_tenant_isolation" ON project_updates
  FOR ALL USING (org_id = get_my_org_id());

-- Project file attachments
CREATE TABLE IF NOT EXISTS project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id),
  user_id UUID NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE project_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project_files_tenant_isolation" ON project_files;
CREATE POLICY "project_files_tenant_isolation" ON project_files
  FOR ALL USING (org_id = get_my_org_id());

-- Drop and re-add status constraint to include 'cancelled'
DO $$ BEGIN
  BEGIN ALTER TABLE tasks DROP CONSTRAINT tasks_status_check;
  EXCEPTION WHEN undefined_object THEN NULL;
  END;
END $$;
ALTER TABLE tasks ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('todo', 'in_progress', 'done', 'parked', 'cancelled'));

-- Task notes
CREATE TABLE IF NOT EXISTS task_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE task_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_notes_all" ON task_notes;
CREATE POLICY "task_notes_all" ON task_notes FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());
CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON task_notes(task_id);

-- Task files
CREATE TABLE IF NOT EXISTS task_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT,
  content_type TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE task_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "task_files_all" ON task_files;
CREATE POLICY "task_files_all" ON task_files FOR ALL USING (org_id = get_my_org_id()) WITH CHECK (org_id = get_my_org_id());
CREATE INDEX IF NOT EXISTS idx_task_files_task_id ON task_files(task_id);

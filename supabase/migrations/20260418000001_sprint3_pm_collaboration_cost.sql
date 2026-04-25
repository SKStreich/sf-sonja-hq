-- Migration: 20260418_003_sprint3_pm_collaboration_cost
-- Sprint 3 — Full PM, Collaboration, Cost Monitoring

-- Extend projects
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS confidentiality_tier confidentiality_tier NOT NULL DEFAULT 'private';

-- Extend tasks: subtasks, assignee, completion tracking
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS assignee_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_tasks_parent ON tasks(parent_task_id) WHERE parent_task_id IS NOT NULL;
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id) WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_tasks_due_date ON tasks(due_date) WHERE due_date IS NOT NULL AND status != 'done';

-- Milestones
CREATE TABLE milestones (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  name         TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  description  TEXT,
  due_date     DATE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_milestones_project ON milestones(project_id);
CREATE INDEX idx_milestones_org ON milestones(org_id);
CREATE TRIGGER milestones_updated_at BEFORE UPDATE ON milestones FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "milestones_tenant_isolation" ON milestones FOR ALL
  USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));

-- Project members (sharing + collaboration)
CREATE TABLE project_members (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  invited_by   UUID NOT NULL REFERENCES auth.users(id),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  permission   TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'comment', 'edit', 'manage')),
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  invited_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  accepted_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, email)
);
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_project_members_email ON project_members(email);
CREATE TRIGGER project_members_updated_at BEFORE UPDATE ON project_members FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_members_owner_all" ON project_members FOR ALL
  USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "project_members_invitee_read" ON project_members FOR SELECT
  USING (user_id = auth.uid() OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Notifications
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id      UUID REFERENCES orgs(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('assignment', 'update', 'due_date', 'mention', 'invite', 'comment')),
  entity_type TEXT NOT NULL CHECK (entity_type IN ('project', 'task', 'capture')),
  entity_id   UUID NOT NULL,
  title       TEXT NOT NULL,
  message     TEXT,
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read) WHERE read = FALSE;
CREATE INDEX idx_notifications_user_created ON notifications(user_id, created_at DESC);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notifications_owner_all" ON notifications FOR ALL
  USING (user_id = auth.uid());

-- Resource usage (cost monitoring)
CREATE TABLE resource_usage (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID REFERENCES orgs(id) ON DELETE CASCADE,
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  service      TEXT NOT NULL CHECK (service IN ('supabase', 'claude_api', 'vercel', 'resend', 'whisper')),
  metric_type  TEXT NOT NULL CHECK (metric_type IN ('api_calls', 'tokens_used', 'emails_sent', 'audio_minutes', 'storage_gb', 'bandwidth_gb', 'function_invocations')),
  value        NUMERIC NOT NULL DEFAULT 0,
  cost_usd     NUMERIC(10,6),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  raw_data     JSONB DEFAULT '{}',
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_resource_usage_service_period ON resource_usage(service, period_start DESC);
CREATE INDEX idx_resource_usage_org ON resource_usage(org_id, period_start DESC);
ALTER TABLE resource_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "resource_usage_owner_read" ON resource_usage FOR SELECT
  USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "resource_usage_service_role_insert" ON resource_usage FOR INSERT
  WITH CHECK (TRUE);

-- Capture promotion tracking
ALTER TABLE captures
  ADD COLUMN IF NOT EXISTS promoted_to_type TEXT CHECK (promoted_to_type IN ('project', 'task')),
  ADD COLUMN IF NOT EXISTS promoted_to_id UUID,
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;

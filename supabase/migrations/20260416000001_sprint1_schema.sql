CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE entity_type AS ENUM ('tm', 'sf', 'personal');
CREATE TYPE project_status AS ENUM ('planning', 'active', 'on_hold', 'complete');
CREATE TYPE project_priority AS ENUM ('high', 'medium', 'low');
CREATE TYPE task_status AS ENUM ('todo', 'in_progress', 'done', 'parked');
CREATE TYPE idea_status AS ENUM ('raw', 'developing', 'parked', 'shipped');
CREATE TYPE idea_source AS ENUM ('typed', 'voice', 'chat');
CREATE TYPE document_source AS ENUM ('notion', 'upload', 'generated');
CREATE TYPE integration_type AS ENUM ('notion', 'claude', 'ms365', 'slack', 'github', 'stripe', 'tm_api');
CREATE TYPE integration_status AS ENUM ('active', 'error', 'disconnected');
CREATE TYPE confidentiality_tier AS ENUM ('private', 'team', 'shared', 'public');
CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'read_only');

CREATE OR REPLACE FUNCTION handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE orgs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  logo_url      TEXT,
  primary_color TEXT DEFAULT '#6366F1',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER orgs_updated_at BEFORE UPDATE ON orgs FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

CREATE TABLE user_profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id        UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  full_name     TEXT,
  avatar_url    TEXT,
  role          user_role NOT NULL DEFAULT 'member',
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_user_profiles_org_id ON user_profiles(org_id);
CREATE TRIGGER user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_profiles_select" ON user_profiles FOR SELECT USING (id = auth.uid() OR org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "user_profiles_update" ON user_profiles FOR UPDATE USING (id = auth.uid());

CREATE TABLE entities (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id      UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by  UUID NOT NULL REFERENCES auth.users(id),
  name        TEXT NOT NULL,
  type        entity_type NOT NULL,
  color       TEXT DEFAULT '#6366F1',
  icon        TEXT,
  active      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, type)
);
CREATE INDEX idx_entities_org_id ON entities(org_id);
CREATE TRIGGER entities_updated_at BEFORE UPDATE ON entities FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER TABLE entities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "entities_tenant_isolation" ON entities FOR ALL USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));

CREATE TABLE projects (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id         UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by     UUID NOT NULL REFERENCES auth.users(id),
  entity_id      UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  description    TEXT,
  status         project_status NOT NULL DEFAULT 'planning',
  priority       project_priority NOT NULL DEFAULT 'medium',
  phase          TEXT,
  next_action    TEXT,
  due_date       DATE,
  tags           TEXT[] DEFAULT '{}',
  notion_url     TEXT,
  github_url     TEXT,
  live_url       TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_projects_org_id ON projects(org_id);
CREATE INDEX idx_projects_entity_id ON projects(entity_id);
CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_tenant_isolation" ON projects FOR ALL USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));

CREATE TABLE tasks (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id               UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES auth.users(id),
  created_by           UUID NOT NULL REFERENCES auth.users(id),
  entity_id            UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  project_id           UUID REFERENCES projects(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  status               task_status NOT NULL DEFAULT 'todo',
  priority             project_priority NOT NULL DEFAULT 'medium',
  due_date             DATE,
  tags                 TEXT[] DEFAULT '{}',
  confidentiality_tier confidentiality_tier NOT NULL DEFAULT 'private',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_tasks_org_id ON tasks(org_id);
CREATE INDEX idx_tasks_user_id ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tasks_tenant_isolation" ON tasks FOR ALL USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()) AND (confidentiality_tier IN ('team', 'shared', 'public') OR user_id = auth.uid()));

CREATE TABLE ideas (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id               UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id              UUID NOT NULL REFERENCES auth.users(id),
  created_by           UUID NOT NULL REFERENCES auth.users(id),
  entity_id            UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  project_id           UUID REFERENCES projects(id) ON DELETE SET NULL,
  text                 TEXT NOT NULL,
  status               idea_status NOT NULL DEFAULT 'raw',
  source               idea_source NOT NULL DEFAULT 'typed',
  tags                 TEXT[] DEFAULT '{}',
  confidentiality_tier confidentiality_tier NOT NULL DEFAULT 'private',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_ideas_org_id ON ideas(org_id);
CREATE INDEX idx_ideas_status ON ideas(status);
CREATE TRIGGER ideas_updated_at BEFORE UPDATE ON ideas FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER TABLE ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ideas_tenant_isolation" ON ideas FOR ALL USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()) AND (confidentiality_tier IN ('team', 'shared', 'public') OR user_id = auth.uid()));

CREATE TABLE chat_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id          UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id),
  created_by      UUID NOT NULL REFERENCES auth.users(id),
  entity_id       UUID REFERENCES entities(id) ON DELETE SET NULL,
  claude_chat_id  TEXT,
  title           TEXT NOT NULL,
  summary         TEXT,
  key_decisions   TEXT[] DEFAULT '{}',
  url             TEXT,
  chat_date       DATE,
  tags            TEXT[] DEFAULT '{}',
  indexed_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chat_history_org_id ON chat_history(org_id);
CREATE INDEX idx_chat_history_fts ON chat_history USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(summary,'')));
CREATE TRIGGER chat_history_updated_at BEFORE UPDATE ON chat_history FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER TABLE chat_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "chat_history_tenant_isolation" ON chat_history FOR ALL USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));

CREATE TABLE documents (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id               UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by           UUID NOT NULL REFERENCES auth.users(id),
  entity_id            UUID REFERENCES entities(id) ON DELETE SET NULL,
  title                TEXT NOT NULL,
  source               document_source NOT NULL DEFAULT 'notion',
  notion_page_id       TEXT,
  notion_url           TEXT,
  content_preview      TEXT,
  tags                 TEXT[] DEFAULT '{}',
  last_synced_at       TIMESTAMPTZ,
  confidentiality_tier confidentiality_tier NOT NULL DEFAULT 'team',
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_documents_org_id ON documents(org_id);
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_tenant_isolation" ON documents FOR ALL USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()) AND (confidentiality_tier IN ('team', 'shared', 'public') OR created_by = auth.uid()));

CREATE TABLE integrations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  type         integration_type NOT NULL,
  config       JSONB DEFAULT '{}',
  status       integration_status NOT NULL DEFAULT 'disconnected',
  last_sync_at TIMESTAMPTZ,
  scopes       TEXT[] DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(org_id, type)
);
CREATE INDEX idx_integrations_org_id ON integrations(org_id);
CREATE TRIGGER integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integrations_admin_only" ON integrations FOR ALL USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()) AND EXISTS (SELECT 1 FROM user_profiles WHERE id = auth.uid() AND role IN ('admin', 'owner')));
CREATE POLICY "integrations_member_read" ON integrations FOR SELECT USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));

CREATE TABLE activity_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES orgs(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id),
  created_by   UUID NOT NULL REFERENCES auth.users(id),
  entity_type  TEXT NOT NULL,
  entity_id    UUID NOT NULL,
  action       TEXT NOT NULL,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_activity_log_org_id ON activity_log(org_id);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE TRIGGER activity_log_updated_at BEFORE UPDATE ON activity_log FOR EACH ROW EXECUTE FUNCTION handle_updated_at();
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "activity_log_tenant_isolation" ON activity_log FOR ALL USING (org_id = (SELECT org_id FROM user_profiles WHERE id = auth.uid()));
CREATE POLICY "activity_log_no_delete" ON activity_log FOR DELETE USING (FALSE);

-- Fix RLS infinite recursion on user_profiles
-- The previous policies used (SELECT org_id FROM user_profiles WHERE id = auth.uid())
-- which caused infinite recursion when user_profiles itself was being queried.
-- Solution: SECURITY DEFINER function that bypasses RLS to look up org_id.

CREATE OR REPLACE FUNCTION get_my_org_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT org_id FROM user_profiles WHERE id = auth.uid() LIMIT 1;
$$;

-- user_profiles policies
DROP POLICY IF EXISTS "user_profiles_select" ON user_profiles;
CREATE POLICY "user_profiles_select" ON user_profiles FOR SELECT
  USING (id = auth.uid() OR org_id = get_my_org_id());

DROP POLICY IF EXISTS "user_profiles_update" ON user_profiles;
CREATE POLICY "user_profiles_update" ON user_profiles FOR UPDATE
  USING (id = auth.uid());

-- entities
DROP POLICY IF EXISTS "entities_tenant_isolation" ON entities;
CREATE POLICY "entities_tenant_isolation" ON entities FOR ALL
  USING (org_id = get_my_org_id());

-- projects
DROP POLICY IF EXISTS "projects_tenant_isolation" ON projects;
CREATE POLICY "projects_tenant_isolation" ON projects FOR ALL
  USING (org_id = get_my_org_id());

-- tasks
DROP POLICY IF EXISTS "tasks_tenant_isolation" ON tasks;
CREATE POLICY "tasks_tenant_isolation" ON tasks FOR ALL
  USING (org_id = get_my_org_id());

-- captures
DROP POLICY IF EXISTS "captures_tenant_isolation" ON captures;
CREATE POLICY "captures_tenant_isolation" ON captures FOR ALL
  USING (org_id = get_my_org_id());

-- focus_notes
DROP POLICY IF EXISTS "focus_notes_tenant_isolation" ON focus_notes;
CREATE POLICY "focus_notes_tenant_isolation" ON focus_notes FOR ALL
  USING (org_id = get_my_org_id());

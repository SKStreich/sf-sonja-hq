CREATE OR REPLACE FUNCTION seed_sonja_hq()
RETURNS TEXT AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE email = 'sstreich1@outlook.com' LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN 'ERROR: User not found. Sign in first with magic link.';
  END IF;

  INSERT INTO orgs (id, name, slug, primary_color)
  VALUES (v_org_id, 'Sonja Streich', 'sonja', '#6366F1')
  ON CONFLICT (id) DO NOTHING;

  UPDATE user_profiles SET role = 'owner', full_name = 'Sonja Streich', org_id = v_org_id WHERE id = v_user_id;

  INSERT INTO entities (org_id, created_by, name, type, color, icon, active) VALUES
    (v_org_id, v_user_id, 'Triplemeter', 'tm', '#0EA5E9', '🚢', TRUE),
    (v_org_id, v_user_id, 'Streich Force', 'sf', '#8B5CF6', '⚡', TRUE),
    (v_org_id, v_user_id, 'Personal', 'personal', '#10B981', '👤', TRUE)
  ON CONFLICT (org_id, type) DO NOTHING;

  INSERT INTO integrations (org_id, created_by, type, status) VALUES
    (v_org_id, v_user_id, 'notion', 'disconnected'),
    (v_org_id, v_user_id, 'claude', 'disconnected'),
    (v_org_id, v_user_id, 'github', 'disconnected')
  ON CONFLICT (org_id, type) DO NOTHING;

  RETURN 'Sonja HQ seeded successfully for user: ' || v_user_id::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

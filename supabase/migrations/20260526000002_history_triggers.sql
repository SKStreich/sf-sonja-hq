-- ─────────────────────────────────────────────────────────────────────────────
-- Triggers that record field changes on tasks + projects into entity_history.
--
-- Cross-project audit row 4, Sprint 12. Spec:
--   docs/specs/hq_history-ui-phase2_v2.html  (sections "Trigger semantics"
--   and "Trigger semantics + actor threading")
--
-- Tracked fields:
--   task    → status, priority, due_date, assignee_id, project_id
--   project → status, priority, due_date, phase
--
-- Actor resolution: COALESCE(current_setting('app.current_user_id'), auth.uid()).
-- User-scoped Server Actions get attributed automatically via auth.uid().
-- Service-role callers (none today; forward-looking) call set_history_actor()
-- once per transaction to set the session-local before their UPDATE.
--
-- SECURITY DEFINER so the trigger can INSERT regardless of the caller's RLS
-- context. The trigger only writes well-formed rows derived from rows the
-- caller already had permission to UPDATE.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Helper: callers set this once per transaction before UPDATEs they want
-- attributed. is_local = true scopes the setting to the current transaction.
CREATE OR REPLACE FUNCTION set_history_actor(user_id UUID) RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_user_id', user_id::text, true);
END;
$$ LANGUAGE plpgsql;

-- ── tasks ──────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_task_history() RETURNS TRIGGER AS $$
DECLARE
  actor UUID := COALESCE(
    NULLIF(current_setting('app.current_user_id', true), '')::uuid,
    auth.uid()
  );
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO entity_history (org_id, entity_type, entity_id, field_name,
                                previous_value, new_value, changed_by)
    VALUES (NEW.org_id, 'task', NEW.id, 'status',
            OLD.status::text, NEW.status::text, actor);
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO entity_history (org_id, entity_type, entity_id, field_name,
                                previous_value, new_value, changed_by)
    VALUES (NEW.org_id, 'task', NEW.id, 'priority',
            OLD.priority::text, NEW.priority::text, actor);
  END IF;

  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO entity_history (org_id, entity_type, entity_id, field_name,
                                previous_value, new_value, changed_by)
    VALUES (NEW.org_id, 'task', NEW.id, 'due_date',
            OLD.due_date::text, NEW.due_date::text, actor);
  END IF;

  IF NEW.assignee_id IS DISTINCT FROM OLD.assignee_id THEN
    INSERT INTO entity_history (org_id, entity_type, entity_id, field_name,
                                previous_value, new_value, changed_by)
    VALUES (NEW.org_id, 'task', NEW.id, 'assignee_id',
            OLD.assignee_id::text, NEW.assignee_id::text, actor);
  END IF;

  IF NEW.project_id IS DISTINCT FROM OLD.project_id THEN
    INSERT INTO entity_history (org_id, entity_type, entity_id, field_name,
                                previous_value, new_value, changed_by)
    VALUES (NEW.org_id, 'task', NEW.id, 'project_id',
            OLD.project_id::text, NEW.project_id::text, actor);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER tasks_history_capture
  AFTER UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION record_task_history();

-- ── projects ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION record_project_history() RETURNS TRIGGER AS $$
DECLARE
  actor UUID := COALESCE(
    NULLIF(current_setting('app.current_user_id', true), '')::uuid,
    auth.uid()
  );
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO entity_history (org_id, entity_type, entity_id, field_name,
                                previous_value, new_value, changed_by)
    VALUES (NEW.org_id, 'project', NEW.id, 'status',
            OLD.status::text, NEW.status::text, actor);
  END IF;

  IF NEW.priority IS DISTINCT FROM OLD.priority THEN
    INSERT INTO entity_history (org_id, entity_type, entity_id, field_name,
                                previous_value, new_value, changed_by)
    VALUES (NEW.org_id, 'project', NEW.id, 'priority',
            OLD.priority::text, NEW.priority::text, actor);
  END IF;

  IF NEW.due_date IS DISTINCT FROM OLD.due_date THEN
    INSERT INTO entity_history (org_id, entity_type, entity_id, field_name,
                                previous_value, new_value, changed_by)
    VALUES (NEW.org_id, 'project', NEW.id, 'due_date',
            OLD.due_date::text, NEW.due_date::text, actor);
  END IF;

  IF NEW.phase IS DISTINCT FROM OLD.phase THEN
    INSERT INTO entity_history (org_id, entity_type, entity_id, field_name,
                                previous_value, new_value, changed_by)
    VALUES (NEW.org_id, 'project', NEW.id, 'phase',
            OLD.phase, NEW.phase, actor);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER projects_history_capture
  AFTER UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION record_project_history();

COMMIT;

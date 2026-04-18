-- GTD bucket for task manager
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS gtd_bucket TEXT NOT NULL DEFAULT 'backlog'
    CHECK (gtd_bucket IN ('today', 'this_week', 'backlog', 'someday'));

CREATE INDEX IF NOT EXISTS idx_tasks_gtd_bucket ON tasks(gtd_bucket);

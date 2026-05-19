-- DR Standard tier — daily DB-dump cron support.
--
-- Two changes:
--   1. backup_state.last_run_details JSONB — typed bag for cron-specific
--      stats. Bucket rows leave it NULL; the new 'db-dump' row writes
--      { tables, rows, retention: { kept, pruned, deleted_keys } }.
--   2. New 'db-dump' row in backup_state so the Connections page surfaces
--      it alongside the storage buckets.
--   3. __backup_list_tables() helper — service-role-only RPC that lists
--      every base table in the public schema with a live-tuple estimate.
--      Lets the cron walk the schema without hardcoding table names.

ALTER TABLE backup_state
  ADD COLUMN IF NOT EXISTS last_run_details JSONB;

INSERT INTO backup_state (bucket_name) VALUES ('db-dump')
ON CONFLICT (bucket_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.__backup_list_tables()
RETURNS TABLE (table_name TEXT, est_rows BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.tablename::TEXT,
    COALESCE(s.n_live_tup, 0)::BIGINT
  FROM pg_tables t
  LEFT JOIN pg_stat_user_tables s
    ON s.schemaname = t.schemaname AND s.relname = t.tablename
  WHERE t.schemaname = 'public'
  ORDER BY t.tablename;
END;
$$;

REVOKE ALL ON FUNCTION public.__backup_list_tables() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.__backup_list_tables() FROM anon;
REVOKE ALL ON FUNCTION public.__backup_list_tables() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.__backup_list_tables() TO service_role;

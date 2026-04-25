-- Backfill companion for migration 009. Now runs in its own transaction after
-- the ALTER TYPE has committed, so 'sfe' is a valid enum label here.
-- No-op on fresh local dev (no existing entities); idempotent via NOT EXISTS.
INSERT INTO entities (org_id, name, type, color)
SELECT DISTINCT e.org_id, 'Streich Force Enterprises', 'sfe'::entity_type, '#6366f1'
FROM entities e
WHERE NOT EXISTS (
  SELECT 1 FROM entities e2 WHERE e2.org_id = e.org_id AND e2.type = 'sfe'::entity_type
);

-- PR-A part 2 — insert the SF-Containers entity row.
-- Must be in a separate migration from the enum-value addition: Postgres
-- requires the new enum value to be committed before it can be cast.
--
-- We clone org_id + created_by from the existing 'sf' (SF Solutions) row so
-- the new entity belongs to the same org without hardcoded UUIDs.

INSERT INTO entities (org_id, created_by, name, type, color, icon, active)
SELECT org_id, created_by, 'SF-Containers', 'sfc'::entity_type, '#0891b2', '📦', true
FROM entities WHERE type = 'sf'
ON CONFLICT DO NOTHING;

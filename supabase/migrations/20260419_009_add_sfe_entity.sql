-- Add Streich Force Enterprises as a new entity type
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'sfe';

-- Insert the new entity for each org that already has entities
INSERT INTO entities (org_id, name, type, color)
SELECT DISTINCT e.org_id, 'Streich Force Enterprises', 'sfe', '#6366f1'
FROM entities e
WHERE NOT EXISTS (
  SELECT 1 FROM entities e2 WHERE e2.org_id = e.org_id AND e2.type = 'sfe'
);

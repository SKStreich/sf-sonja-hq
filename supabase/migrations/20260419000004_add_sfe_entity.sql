-- Add Streich Force Enterprises as a new entity type.
-- Postgres disallows using a newly-added enum value in the same transaction
-- that adds it, so the backfill of `entities` rows lives in migration 015.
ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'sfe';

-- CTHQ display name: 'CTHQ' → 'Container Trade HQ'.
-- (CTHQ = Container Trade HQ; slated to replace TM in the near future.)
-- The dashboard entity cards + tabs read entities.name directly, so the row's
-- name must match the registry label in src/lib/entities/config.ts.
UPDATE entities
SET name = 'Container Trade HQ', updated_at = now()
WHERE type = 'cthq' AND name = 'CTHQ';

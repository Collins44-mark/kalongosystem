-- Remove failed migration record so deploy can re-apply it (P3009 fix)
-- Only delete if failed (finished_at IS NULL); leave successful records intact
DELETE FROM _prisma_migrations
WHERE migration_name = '20260225130000_cleaning_laundry_workflow'
  AND finished_at IS NULL;

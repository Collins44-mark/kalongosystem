-- Remove failed migration record (P3009 fix) - delete regardless of state
DELETE FROM _prisma_migrations WHERE migration_name = '20260225130000_cleaning_laundry_workflow';

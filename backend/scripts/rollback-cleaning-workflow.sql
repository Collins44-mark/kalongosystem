-- Run this ONLY if the cleaning_laundry_workflow migration partially applied
-- and "prisma migrate deploy" fails with "column already exists".
-- Execute against your database, then run: prisma migrate resolve --rolled-back "20260225130000_cleaning_laundry_workflow"
-- Then: prisma migrate deploy

-- Remove foreign keys first (if they exist)
ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_cleaning_assigned_to_worker_id_fkey";
ALTER TABLE "rooms" DROP CONSTRAINT IF EXISTS "rooms_cleaning_assigned_by_worker_id_fkey";
ALTER TABLE "laundry_requests" DROP CONSTRAINT IF EXISTS "laundry_requests_assigned_to_worker_id_fkey";
ALTER TABLE "laundry_requests" DROP CONSTRAINT IF EXISTS "laundry_requests_assigned_by_worker_id_fkey";

-- Remove columns from rooms
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "cleaning_assigned_to_worker_id";
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "cleaning_assigned_at";
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "cleaning_assigned_by_worker_id";
ALTER TABLE "rooms" DROP COLUMN IF EXISTS "cleaning_status";

-- Remove columns from room_cleaning_logs
ALTER TABLE "room_cleaning_logs" DROP COLUMN IF EXISTS "assigned_staff_id";
ALTER TABLE "room_cleaning_logs" DROP COLUMN IF EXISTS "assigned_staff_name";

-- Remove columns from laundry_requests
ALTER TABLE "laundry_requests" DROP COLUMN IF EXISTS "assigned_to_worker_id";
ALTER TABLE "laundry_requests" DROP COLUMN IF EXISTS "assigned_by_worker_id";
ALTER TABLE "laundry_requests" DROP COLUMN IF EXISTS "assigned_at";

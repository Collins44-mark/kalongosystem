-- AlterTable Room: cleaning assignment (idempotent for P3009 recovery)
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "cleaning_assigned_to_worker_id" TEXT;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "cleaning_assigned_at" TIMESTAMP(3);
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "cleaning_assigned_by_worker_id" TEXT;
ALTER TABLE "rooms" ADD COLUMN IF NOT EXISTS "cleaning_status" TEXT;

-- AlterTable RoomCleaningLog: assigned staff
ALTER TABLE "room_cleaning_logs" ADD COLUMN IF NOT EXISTS "assigned_staff_id" TEXT;
ALTER TABLE "room_cleaning_logs" ADD COLUMN IF NOT EXISTS "assigned_staff_name" TEXT;

-- AlterTable LaundryRequest: assignment
ALTER TABLE "laundry_requests" ADD COLUMN IF NOT EXISTS "assigned_to_worker_id" TEXT;
ALTER TABLE "laundry_requests" ADD COLUMN IF NOT EXISTS "assigned_by_worker_id" TEXT;
ALTER TABLE "laundry_requests" ADD COLUMN IF NOT EXISTS "assigned_at" TIMESTAMP(3);

-- AddForeignKey (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_cleaning_assigned_to_worker_id_fkey') THEN
    ALTER TABLE "rooms" ADD CONSTRAINT "rooms_cleaning_assigned_to_worker_id_fkey" FOREIGN KEY ("cleaning_assigned_to_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rooms_cleaning_assigned_by_worker_id_fkey') THEN
    ALTER TABLE "rooms" ADD CONSTRAINT "rooms_cleaning_assigned_by_worker_id_fkey" FOREIGN KEY ("cleaning_assigned_by_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'laundry_requests_assigned_to_worker_id_fkey') THEN
    ALTER TABLE "laundry_requests" ADD CONSTRAINT "laundry_requests_assigned_to_worker_id_fkey" FOREIGN KEY ("assigned_to_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'laundry_requests_assigned_by_worker_id_fkey') THEN
    ALTER TABLE "laundry_requests" ADD CONSTRAINT "laundry_requests_assigned_by_worker_id_fkey" FOREIGN KEY ("assigned_by_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

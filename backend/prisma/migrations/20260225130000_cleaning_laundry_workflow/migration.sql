-- AlterTable Room: cleaning assignment
ALTER TABLE "rooms" ADD COLUMN "cleaning_assigned_to_worker_id" TEXT;
ALTER TABLE "rooms" ADD COLUMN "cleaning_assigned_at" TIMESTAMP(3);
ALTER TABLE "rooms" ADD COLUMN "cleaning_assigned_by_worker_id" TEXT;
ALTER TABLE "rooms" ADD COLUMN "cleaning_status" TEXT;

-- AlterTable RoomCleaningLog: assigned staff
ALTER TABLE "room_cleaning_logs" ADD COLUMN "assigned_staff_id" TEXT;
ALTER TABLE "room_cleaning_logs" ADD COLUMN "assigned_staff_name" TEXT;

-- AlterTable LaundryRequest: assignment
ALTER TABLE "laundry_requests" ADD COLUMN "assigned_to_worker_id" TEXT;
ALTER TABLE "laundry_requests" ADD COLUMN "assigned_by_worker_id" TEXT;
ALTER TABLE "laundry_requests" ADD COLUMN "assigned_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_cleaning_assigned_to_worker_id_fkey" FOREIGN KEY ("cleaning_assigned_to_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_cleaning_assigned_by_worker_id_fkey" FOREIGN KEY ("cleaning_assigned_by_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "laundry_requests" ADD CONSTRAINT "laundry_requests_assigned_to_worker_id_fkey" FOREIGN KEY ("assigned_to_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "laundry_requests" ADD CONSTRAINT "laundry_requests_assigned_by_worker_id_fkey" FOREIGN KEY ("assigned_by_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

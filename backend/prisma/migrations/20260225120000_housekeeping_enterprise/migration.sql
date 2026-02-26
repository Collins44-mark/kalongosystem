-- AlterTable
ALTER TABLE "rooms" ADD COLUMN "maintenance_reason" TEXT,
ADD COLUMN "maintenance_estimated_at" TIMESTAMP(3),
ADD COLUMN "cleaning_assigned_to_worker_id" TEXT,
ADD COLUMN "cleaning_assigned_at" TIMESTAMP(3),
ADD COLUMN "cleaning_assigned_by_worker_id" TEXT;

-- AlterTable
ALTER TABLE "laundry_requests" ADD COLUMN "assigned_to_worker_id" TEXT,
ADD COLUMN "assigned_by_worker_id" TEXT,
ADD COLUMN "assigned_at" TIMESTAMP(3);

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_cleaning_assigned_to_worker_id_fkey" FOREIGN KEY ("cleaning_assigned_to_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_cleaning_assigned_by_worker_id_fkey" FOREIGN KEY ("cleaning_assigned_by_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_requests" ADD CONSTRAINT "laundry_requests_assigned_to_worker_id_fkey" FOREIGN KEY ("assigned_to_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "laundry_requests" ADD CONSTRAINT "laundry_requests_assigned_by_worker_id_fkey" FOREIGN KEY ("assigned_by_worker_id") REFERENCES "staff_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

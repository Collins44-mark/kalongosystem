-- CreateTable: staff_workers - role-based workers (real people under a role)
CREATE TABLE IF NOT EXISTS "staff_workers" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_workers_pkey" PRIMARY KEY ("id")
);

-- AlterTable: Add workerId, workerName to audit_logs
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "workerId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "workerName" TEXT;

-- Foreign key for staff_workers
ALTER TABLE "staff_workers" ADD CONSTRAINT "staff_workers_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add served-by worker fields to bookings for display (worker name, not role/email)

ALTER TABLE "bookings"
ADD COLUMN IF NOT EXISTS "createdByWorkerId" TEXT,
ADD COLUMN IF NOT EXISTS "createdByWorkerName" TEXT;

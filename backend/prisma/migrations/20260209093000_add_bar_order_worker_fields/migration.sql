-- Add staff-worker attribution fields for bar orders
ALTER TABLE "bar_orders"
  ADD COLUMN IF NOT EXISTS "createdByRole" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByWorkerId" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByWorkerName" TEXT;


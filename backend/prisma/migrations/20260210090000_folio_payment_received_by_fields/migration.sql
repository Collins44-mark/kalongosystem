-- Add received-by fields to folio payments for auditability (role + worker)

ALTER TABLE "folio_payments"
ADD COLUMN IF NOT EXISTS "createdByRole" TEXT,
ADD COLUMN IF NOT EXISTS "createdByWorkerId" TEXT,
ADD COLUMN IF NOT EXISTS "createdByWorkerName" TEXT;


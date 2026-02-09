-- Restaurant: menu management + worker accountability
ALTER TABLE "restaurant_items"
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "isEnabled" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "restaurant_orders"
  ADD COLUMN IF NOT EXISTS "createdByRole" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByWorkerId" TEXT,
  ADD COLUMN IF NOT EXISTS "createdByWorkerName" TEXT;


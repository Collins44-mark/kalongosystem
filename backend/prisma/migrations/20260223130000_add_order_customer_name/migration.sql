-- Add customer name field for bar/restaurant walk-in sales
ALTER TABLE "bar_orders"
  ADD COLUMN IF NOT EXISTS "customerName" TEXT;

ALTER TABLE "restaurant_orders"
  ADD COLUMN IF NOT EXISTS "customerName" TEXT;


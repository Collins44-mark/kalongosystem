-- Other revenue categories and other revenue entries (optional booking charges)

-- Booking base room amount (so attached charges don't distort room revenue reporting)
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "room_amount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill existing bookings: assume current totalAmount is room amount baseline
UPDATE "bookings"
SET "room_amount" = "totalAmount"
WHERE "room_amount" = 0;

-- Revenue categories
CREATE TABLE IF NOT EXISTS "revenue_categories" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "linked_quickbooks_account_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "revenue_categories_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "revenue_categories_company_id_name_key"
  ON "revenue_categories" ("company_id", "name");

CREATE INDEX IF NOT EXISTS "revenue_categories_company_id_created_at_idx"
  ON "revenue_categories" ("company_id", "created_at");

ALTER TABLE "revenue_categories"
  ADD CONSTRAINT "revenue_categories_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Other revenues (standalone or attached to a booking)
CREATE TABLE IF NOT EXISTS "other_revenues" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "booking_id" TEXT,
  "category_id" TEXT NOT NULL,
  "description" TEXT,
  "amount" DECIMAL(12,2) NOT NULL,
  "payment_method" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "created_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "other_revenues_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "other_revenues_company_id_date_idx"
  ON "other_revenues" ("company_id", "date");

CREATE INDEX IF NOT EXISTS "other_revenues_company_id_booking_id_idx"
  ON "other_revenues" ("company_id", "booking_id");

CREATE INDEX IF NOT EXISTS "other_revenues_company_id_category_id_idx"
  ON "other_revenues" ("company_id", "category_id");

ALTER TABLE "other_revenues"
  ADD CONSTRAINT "other_revenues_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "other_revenues"
  ADD CONSTRAINT "other_revenues_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "other_revenues"
  ADD CONSTRAINT "other_revenues_category_id_fkey"
  FOREIGN KEY ("category_id") REFERENCES "revenue_categories"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;


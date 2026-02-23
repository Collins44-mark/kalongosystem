-- Optional QuickBooks integration (must not break core HMS)

-- Businesses: connection status + realm id
ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "quickbooks_connected" BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "quickbooks_realm_id" TEXT;

-- Bookings: store created invoice id
ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "quickbooks_invoice_id" TEXT;

-- Tokens table (1 row per company)
CREATE TABLE IF NOT EXISTS "quickbooks_tokens" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "access_token" TEXT NOT NULL,
  "refresh_token" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "quickbooks_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "quickbooks_tokens_company_id_key"
  ON "quickbooks_tokens" ("company_id");

ALTER TABLE "quickbooks_tokens"
  ADD CONSTRAINT "quickbooks_tokens_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Sync logs (append-only)
CREATE TABLE IF NOT EXISTS "sync_logs" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "entity_type" TEXT NOT NULL,
  "entity_id" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "error_message" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "sync_logs_company_id_created_at_idx"
  ON "sync_logs" ("company_id", "created_at");

CREATE INDEX IF NOT EXISTS "sync_logs_company_id_entity_type_idx"
  ON "sync_logs" ("company_id", "entity_type");

CREATE INDEX IF NOT EXISTS "sync_logs_company_id_status_idx"
  ON "sync_logs" ("company_id", "status");

ALTER TABLE "sync_logs"
  ADD CONSTRAINT "sync_logs_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "businesses"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;


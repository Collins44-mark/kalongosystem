-- Add business logo URL for PDF exports
ALTER TABLE "businesses"
  ADD COLUMN IF NOT EXISTS "logo_url" TEXT;


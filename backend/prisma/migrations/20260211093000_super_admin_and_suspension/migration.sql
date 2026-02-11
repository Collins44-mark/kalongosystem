-- Add super admin + suspension fields

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "forcePasswordChange" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "businesses"
ADD COLUMN IF NOT EXISTS "isSuspended" BOOLEAN NOT NULL DEFAULT false;


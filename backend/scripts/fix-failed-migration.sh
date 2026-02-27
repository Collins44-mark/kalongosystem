#!/bin/bash
# Fix P3009: Resolve failed migration so new migrations can run.
# Run from backend/ directory: bash scripts/fix-failed-migration.sh
#
# If Step 2 fails with "column already exists", the migration partially ran.
# Then: 1) Run scripts/rollback-cleaning-workflow.sql against your DB
#       2) Run this script again

set -e

echo "Step 1: Mark failed migration as rolled back..."
npx prisma migrate resolve --rolled-back "20260225130000_cleaning_laundry_workflow"

echo "Step 2: Deploy migrations (will re-run the rolled-back one + any pending)..."
npx prisma migrate deploy

echo "Done."

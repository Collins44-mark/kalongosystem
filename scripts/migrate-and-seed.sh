#!/usr/bin/env bash
# Run migrations and seed the superadmin user. Requires DATABASE_URL in backend/.env

set -e
cd "$(dirname "$0")/../backend"

echo "Running migrations..."
npx prisma migrate deploy

echo "Seeding superadmin user..."
node prisma/seed.js

echo "Done. You can log in with Business ID: HMS-1, your email, and password."

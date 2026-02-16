#!/usr/bin/env bash
# Install all dependencies for backend and frontend.
# Requires Node.js (and npm) to be installed: https://nodejs.org

set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "Installing backend dependencies..."
cd backend
npm install
echo "Generating Prisma client..."
npx prisma generate
cd "$ROOT"

echo "Installing frontend dependencies..."
cd frontend
npm install
cd "$ROOT"

echo ""
echo "Done. Next steps:"
echo "  1. Backend:  cp backend/.env.example backend/.env  and set DATABASE_URL"
echo "  2. Backend:  npx prisma migrate deploy  (then  node backend/prisma/seed.js  for superadmin)"
echo "  3. Frontend: cp frontend/.env.example frontend/.env.local  and set NEXT_PUBLIC_API_URL"
echo "  4. Run backend:  cd backend && npm run start:dev"
echo "  5. Run frontend: cd frontend && npm run dev"

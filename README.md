# HMS - SaaS Hotel Management System

Multi-tenant Hotel Management System for Tanzania. Built with Next.js (Vercel) and NestJS (Render).

## Quick Start

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL DATABASE_URL (default: postgresql://postgres:postgres@localhost:5432/hms)
npm install
npx prisma migrate deploy   # or: npx prisma migrate dev --name init
npm run start:dev
```

### Frontend

```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev
```

### Flow

1. **Sign Up** → Email + Password
2. **Register Business** → Business type, name, location, phone. Gets unique Business ID (e.g. HMS-49281) and 14-day trial
3. **Login** → Business ID + Email + Password
4. **Dashboard** → Role-based: Admin sees Overview, Front Office, Bar, Restaurant, Housekeeping, Finance, Workers, Inventory, Reports, Settings

### Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, Zustand
- **Backend**: NestJS, Prisma, PostgreSQL, JWT
- **Deploy**: Vercel (frontend), Render (backend + DB)

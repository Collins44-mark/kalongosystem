# HMS - SaaS Hotel Management System

Multi-tenant Hotel Management System for Tanzania. Built with Next.js (Vercel) and NestJS (Render).

## Quick Start

### Backend (local)

```bash
cd backend
cp .env.example .env
# Edit .env with your PostgreSQL DATABASE_URL
npm install
npx prisma migrate deploy
npm run start:dev
```

### Frontend (local)

```bash
cd frontend
cp .env.example .env.local
# NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev
```

## Deploy to Render

### Option A: Use Blueprint (recommended)

1. In [Render Dashboard](https://dashboard.render.com), create a **New** → **Blueprint**
2. Connect your GitHub repo
3. Render will detect `render.yaml` at the repo root
4. When prompted, set:
   - **DATABASE_URL** – your Render Postgres connection string (Internal URL)
   - **JWT_SECRET** – a long random string (e.g. `openssl rand -base64 32`)
   - **FRONTEND_URL** – your Vercel/frontend URL (e.g. `https://yourapp.vercel.app`)

### Option B: Manual Web Service

1. **New** → **Web Service**
2. Connect your repo
3. Configure:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
   - **Start Command:** `npm run start:prod`
   - **Instance Type:** Starter or higher

4. **Environment variables** (required):
   - `DATABASE_URL` – Postgres connection string
   - `JWT_SECRET` – secret for JWT signing
   - `FRONTEND_URL` – frontend URL for CORS

### Render Postgres

- Create a **PostgreSQL** database in Render
- Use the **Internal** connection string for `DATABASE_URL` (private network)
- If using External URL, ensure `?sslmode=require` at the end for SSL

## Common Render errors

| Error | Fix |
|-------|-----|
| `nest: not found` | Build command must run from `backend/` (set Root Directory) |
| `Could not find declaration for passport-jwt` | Already fixed in codebase |
| `Can't reach database` | Use Internal URL, not External; check DATABASE_URL |
| `P1001` (DB connection) | Ensure Postgres is in same region; add `?sslmode=require` if external |

## Deploy frontend to Vercel

1. Import the repo in Vercel
2. Set **Root Directory:** `frontend`
3. Add env var: `NEXT_PUBLIC_API_URL` = your Render backend URL

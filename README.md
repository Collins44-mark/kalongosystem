# HMS - SaaS Hotel Management System

Multi-tenant Hotel Management System for Tanzania. Built with Next.js (Vercel) and NestJS (Render).

## Install everything (first time)

1. **Install Node.js** (LTS) if you don’t have it: [nodejs.org](https://nodejs.org) or `brew install node`.
2. From the project root, run:

   ```bash
   chmod +x scripts/install-all.sh
   ./scripts/install-all.sh
   ```

   Or manually:

   ```bash
   cd backend && npm install && npx prisma generate && cd ..
   cd frontend && npm install
   ```

3. Copy env files and set your database URL (see Quick Start below).

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

### "Table users does not exist" – Run migrations

If you see this error, the database migrations haven't run. Fix:

1. **Render Dashboard** → your backend service → **Settings** → **Build & Deploy**
2. Ensure **Build Command** is exactly:
   ```
   npm install && npx prisma generate && npx prisma migrate deploy && npm run build
   ```
3. Ensure **DATABASE_URL** is set (link your Postgres DB or add it manually)
4. **Manual Deploy** → **Clear build cache & deploy**

Or run migrations once via Render Shell: **Shell** tab → run:
```
cd backend && npx prisma migrate deploy
```

### Seed super admin (no Shell / free tier)

If you can’t use Render Shell (e.g. on free tier):

1. In **Render Dashboard** → your backend service → **Environment** → add:
   - **Key:** `SEED_SECRET`  
   - **Value:** a random string (e.g. `mySecretSeed123`)
2. Save and redeploy the backend.
3. In your browser, open (use your backend URL and the same secret):
   ```
   https://YOUR-BACKEND.onrender.com/super-admin/seed?secret=mySecretSeed123
   ```
4. You should see: `{"ok":true,"message":"Super admin user seeded/updated: ..."}`. You can then log in at `/super-admin` with Business ID **HMS-1**, email **markkcollins979@gmail.com**, password **Kentana44**.
5. (Optional) Remove `SEED_SECRET` from Environment after seeding.

## Common Render errors

| Error | Fix |
|-------|-----|
| `nest: not found` | Build command must run from `backend/` (set Root Directory) |
| `Could not find declaration for passport-jwt` | Already fixed in codebase |
| `Can't reach database` | Use Internal URL, not External; check DATABASE_URL |
| `P1001` (DB connection) | Ensure Postgres is in same region; add `?sslmode=require` if external |

## Deploy frontend to Vercel

1. Import the repo in Vercel
2. **Root Directory:** set to `frontend` (required for monorepo – fixes "No Output Directory named public" error)
3. **Framework Preset:** Next.js (auto-detected when Root Directory is correct)
4. Add env var: `NEXT_PUBLIC_API_URL` = your Render backend URL (e.g. `https://hms-backend-xxx.onrender.com`)

**Important:** For frontend ↔ backend to work:
- **Vercel:** `NEXT_PUBLIC_API_URL` = your Render backend URL
- **Render:** `FRONTEND_URL` = your Vercel frontend URL (e.g. `https://yourapp.vercel.app`)

If you get "Failed to fetch": check both URLs, ensure no trailing slashes, and redeploy both.

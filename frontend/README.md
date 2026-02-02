# Kalongo Hotel – Frontend

Next.js (App Router), TypeScript, Tailwind, JWT. UI adapts to permissions (RoleGuard); no hard-coded roles.

## Setup

```bash
npm install
cp .env.local.example .env.local
# Set NEXT_PUBLIC_API_URL=http://localhost:8000
npm run dev
```

## Pages

- `/` – Home
- `/login` – Sign in
- `/dashboard` – Manager dashboard (sales, sector, export)
- `/dashboard/bookings` – Bookings & check-in
- `/dashboard/bookings/new` – New booking
- `/dashboard/pos/restaurant`, `/dashboard/pos/bar` – POS
- `/dashboard/kitchen` – Kitchen display
- `/dashboard/housekeeping` – Housekeeping & maintenance
- `/dashboard/staff` – Staff, roles & permissions
- `/check-in/qr/[token]` – Guest self check-in (public)

## Auth

- JWT stored in localStorage; `api` adds `Authorization` header.
- `useAuth()` provides `user`, `loading`, `refreshUser`.
- `RoleGuard` shows children only if user has `permission` (or is manager).

## Vercel

- Set `NEXT_PUBLIC_API_URL` to backend URL.
- Build: `npm run build`; start: `npm start`.

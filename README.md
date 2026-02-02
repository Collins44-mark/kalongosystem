# Kalongo Hotel – Hotel Management & Financial Control System

Enterprise-grade PMS for Kalongo Hotel (Tanzania), with folio-centric billing, RBAC, POS, and Excel-first reporting.

## Stack

- **Frontend:** Next.js (App Router), TypeScript, Tailwind CSS, JWT auth → Vercel
- **Backend:** Django, Django REST Framework, PostgreSQL, JWT → Render

## Quick start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env         # Edit SECRET_KEY, DATABASE_URL, CORS
python manage.py migrate
python manage.py seed_kalongo
python manage.py runserver
```

- **Seed admin:** `admin` / `admin123`
- **API root:** http://localhost:8000/api/

### Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

- **App:** http://localhost:3000
- **Login:** http://localhost:3000/login

## Features

- **Auth:** JWT (access + refresh), dynamic RBAC (permissions = actions, roles = collections)
- **Hotel:** Room types, rooms, guests, bookings, folio-centric billing, check-in/check-out
- **QR self check-in:** Unique QR per booking → guest form → reception approval
- **POS:** Restaurant & Bar menus (fixed prices), Pay Now (receipt) or Post to Room (folio charge), kitchen flow
- **Housekeeping & maintenance:** Requests linked to rooms, expenses recorded
- **Payments:** Cash, M-Pesa, Airtel Money, Tigo Pesa, bank, card; split payments; receipt on confirmation
- **Tax:** Admin-defined (VAT, Tourism Levy, etc.), auto-applied; TRA-friendly reports
- **Finance & HR:** Staff, salaries, expenses, net profit
- **Reports:** Dashboard APIs, graph-ready endpoints, Excel/PDF/CSV export

## Deployment

- **Backend (Render):** Set `DATABASE_URL`, `SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`; use `gunicorn config.wsgi:application`.
- **Frontend (Vercel):** Set `NEXT_PUBLIC_API_URL` to your backend URL.

## License

Proprietary – Kalongo Hotel.

# Kalongo Hotel – Backend

Django REST API: JWT auth, RBAC, hotel, POS, finance, reports.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: SECRET_KEY, DATABASE_URL (PostgreSQL), CORS_ALLOWED_ORIGINS
python manage.py migrate
python manage.py seed_kalongo
python manage.py runserver
```

## Seed

- `python manage.py seed_kalongo` creates departments, permissions, roles (Manager, Receptionist, Restaurant Staff), admin user (`admin` / `admin123`), room types, rooms, taxes, restaurant & bar menus.

## API (main)

- `POST /api/auth/login/` – JWT login
- `GET /api/auth/me/` – current user + permission_codes
- `GET/POST /api/bookings/`, `POST /api/bookings/create/`, `POST /api/bookings/<id>/check-in/`, `POST /api/bookings/<id>/check-out/`
- `GET /api/folio/<id>/`, `POST /api/folio/charges/`, `POST /api/folio/payments/`
- `GET /api/qr/<token>/`, `POST /api/qr/<token>/submit/` – QR self check-in
- `GET /api/menus/`, `GET /api/menu-items/`, `POST /api/orders/`, `PATCH /api/orders/<id>/status/`
- `GET /api/reports/dashboard/`, `GET /api/reports/export/excel/`, `GET /api/reports/export/csv/`

## Render

- Build: `pip install -r requirements.txt`
- Start: `gunicorn config.wsgi:application`
- Set env: `DATABASE_URL`, `SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`.

# HMS Backend

SaaS Hotel Management System - NestJS API

## Setup

1. Copy `.env.example` to `.env` and fill in your PostgreSQL URL.
2. `npm install`
3. `npx prisma migrate dev` (creates DB schema)
4. `npm run start:dev`

## Deploy to Render

- Set `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL` in Render env vars
- Build command: `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
- Start command: `npm run start:prod`

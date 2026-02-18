# Add role_messages table

This migration creates the `role_messages` table for the Messages feature (send message to role, inbox).

**After pulling, run:** `npx prisma migrate deploy` (or `npx prisma migrate dev` in development) so the table exists. Otherwise sending a message will fail with "table role_messages does not exist".

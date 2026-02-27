#!/usr/bin/env node
/**
 * Clear failed migration record from _prisma_migrations (P3009 fix).
 * Uses Prisma Client $executeRawUnsafe - works reliably on Render.
 */
const path = require('path');
try { require('dotenv').config({ path: path.join(__dirname, '../.env') }); } catch { /* dotenv optional */ }

async function main() {
  const { PrismaClient } = require('@prisma/client');
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      "DELETE FROM _prisma_migrations WHERE migration_name = '20260225130000_cleaning_laundry_workflow'"
    );
    console.log('Cleared failed migration record (if any)');
  } catch (e) {
    console.warn('clear-failed-migration:', e.message || e);
  } finally {
    await prisma.$disconnect();
  }
}

main().then(() => process.exit(0)).catch(() => process.exit(0));

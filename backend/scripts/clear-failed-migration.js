#!/usr/bin/env node
/**
 * Clear failed migration record from _prisma_migrations (P3009 fix).
 * Run before prisma migrate deploy during production build.
 */
const { execSync } = require('child_process');
const path = require('path');

const backendDir = path.join(__dirname, '..');
const sqlFile = path.join(backendDir, 'prisma/scripts/clear-failed-migration.sql');
const schemaPath = path.join(backendDir, 'prisma/schema.prisma');

try {
  execSync(`npx prisma db execute --file "${sqlFile}" --schema "${schemaPath}"`, {
    stdio: 'inherit',
    cwd: backendDir,
  });
  console.log('Cleared failed migration record (if any)');
} catch (e) {
  console.warn('clear-failed-migration:', e.message || e);
  process.exit(0);
}

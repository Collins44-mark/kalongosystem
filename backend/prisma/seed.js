/* eslint-disable no-console */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

// Render internal host not resolvable locally - use external host
let dbUrl = process.env.DATABASE_URL || '';
if (dbUrl.includes('@dpg-') && dbUrl.includes('-a/')) {
  process.env.DATABASE_URL = dbUrl.replace(/@(dpg-[a-z0-9]+-a)\//, '@$1.oregon-postgres.render.com/');
}

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = 'markkcollins979@gmail.com';
const SUPER_ADMIN_BUSINESS_ID = 'HMS-1';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_INIT_PASSWORD || 'Super@44';

async function main() {
  const email = SUPER_ADMIN_EMAIL.toLowerCase().trim();
  const hashed = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

  // Remove "Super Admin Business" (HMS-1) so super-admin only uses /super-admin dashboard
  const existing = await prisma.business.findUnique({ where: { businessId: SUPER_ADMIN_BUSINESS_ID } });
  if (existing) {
    await prisma.business.delete({ where: { id: existing.id } });
  }

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      password: hashed,
      isSuperAdmin: true,
      forcePasswordChange: false,
      name: 'Super Admin',
      language: 'en',
    },
    create: {
      email,
      password: hashed,
      language: 'en',
      isSuperAdmin: true,
      forcePasswordChange: false,
      name: 'Super Admin',
    },
  });

  console.log('Super admin seeded:', email, '| Log in at /login or /super-admin with Business ID:', SUPER_ADMIN_BUSINESS_ID);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

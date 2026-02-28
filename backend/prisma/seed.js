/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SUPER_ADMIN_EMAIL = 'markkcollins979@gmail.com';
const SUPER_ADMIN_BUSINESS_ID = 'HMS-1';
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_INIT_PASSWORD || 'Super@44';

async function main() {
  const email = SUPER_ADMIN_EMAIL.toLowerCase().trim();
  const hashed = await bcrypt.hash(SUPER_ADMIN_PASSWORD, 10);

  const business = await prisma.business.upsert({
    where: { businessId: SUPER_ADMIN_BUSINESS_ID },
    update: {},
    create: {
      businessId: SUPER_ADMIN_BUSINESS_ID,
      businessType: 'HOTEL',
      name: 'Super Admin Business',
      createdBy: null,
    },
  });

  const trialEndsAt = new Date();
  trialEndsAt.setDate(trialEndsAt.getDate() + 365);
  await prisma.subscription.upsert({
    where: { businessId: business.id },
    update: {},
    create: {
      businessId: business.id,
      plan: 'FRONT_AND_BACK',
      status: 'TRIAL',
      trialEndsAt,
    },
  });

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

  await prisma.businessUser.upsert({
    where: {
      userId_businessId: { userId: user.id, businessId: business.id },
    },
    update: { role: 'MANAGER' },
    create: {
      userId: user.id,
      businessId: business.id,
      role: 'MANAGER',
      branchId: 'main',
    },
  });

  console.log('Super admin seeded:', email, '| Business ID:', SUPER_ADMIN_BUSINESS_ID);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

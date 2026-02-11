/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'markkcollins979@gmail.com'.toLowerCase().trim();
  const password = 'Kentana44';

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
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
  console.log('Seeded/updated super admin user:', email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


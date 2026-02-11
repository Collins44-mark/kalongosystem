/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  const email = 'markkcollins979@gmail.com'.toLowerCase().trim();
  const password = 'Kentana44';

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    // Ensure flags are set even if user existed
    await prisma.user.update({
      where: { email },
      data: { isSuperAdmin: true },
    });
    console.log('Super admin already exists, ensured isSuperAdmin=true');
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      email,
      password: hashed,
      language: 'en',
      isSuperAdmin: true,
      forcePasswordChange: false,
      name: 'Super Admin',
    },
  });
  console.log('Seeded super admin user:', email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });


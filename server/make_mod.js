import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function run() {
  const user = await prisma.user.update({
    where: { email: 'baldybekassylkhan@gmail.com' },
    data: { role: 'moderator' }
  });
  console.log('Updated user role to:', user.role);
}
run().catch(console.error).finally(() => prisma.$disconnect());

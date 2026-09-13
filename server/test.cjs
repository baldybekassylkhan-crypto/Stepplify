const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const r = await prisma.report.findFirst({ where: { targetType: 'review' } });
  if (r) {
    try {
      const review = await prisma.review.findUnique({ where: { id: r.targetId }, include: { user: { select: { fullName: true } }, article: { select: { id: true, title: true } } }});
      console.log('review', review);
    } catch(e) { console.error('FAIL review', e.message); }
  }
  
  const rep = await prisma.report.findFirst({ where: { targetType: 'reply' } });
  if (rep) {
    try {
      const reply = await prisma.reply.findUnique({ where: { id: rep.targetId }, include: { user: { select: { fullName: true } }, review: { include: { article: { select: { id: true, title: true } } } } }});
      console.log('reply', reply);
    } catch(e) { console.error('FAIL reply', e.message); }
  }
}
run().finally(() => prisma.$disconnect());

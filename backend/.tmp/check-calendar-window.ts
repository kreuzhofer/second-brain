import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const blocks = await prisma.calendarBusyBlock.findMany({
    where: {
      startAt: { gte: new Date('2026-02-09T00:00:00.000Z') },
      endAt: { lte: new Date('2026-02-11T23:59:59.999Z') }
    },
    include: { source: { select: { name: true, enabled: true } } },
    orderBy: { startAt: 'asc' }
  });

  for (const b of blocks) {
    console.log(JSON.stringify({
      source: b.source.name,
      enabled: b.source.enabled,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      title: b.title,
      location: b.location,
      isAllDay: b.isAllDay
    }));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});

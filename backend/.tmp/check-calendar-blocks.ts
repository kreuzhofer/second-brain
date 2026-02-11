import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const sources = await prisma.calendarSource.findMany({
    select: {
      id: true,
      name: true,
      enabled: true,
      lastSyncAt: true,
      fetchStatus: true,
      fetchError: true,
      _count: { select: { busyBlocks: true } }
    },
    orderBy: { createdAt: 'asc' }
  });

  console.log('SOURCES');
  for (const s of sources) {
    console.log(JSON.stringify({
      id: s.id,
      name: s.name,
      enabled: s.enabled,
      busyBlocks: s._count.busyBlocks,
      lastSyncAt: s.lastSyncAt?.toISOString() ?? null,
      fetchStatus: s.fetchStatus,
      fetchError: s.fetchError
    }));
  }

  const aggregates = await prisma.calendarBusyBlock.groupBy({
    by: ['sourceId'],
    _count: { _all: true, title: true, location: true }
  });

  console.log('BLOCK_COUNTS_BY_SOURCE');
  for (const a of aggregates) {
    const src = sources.find((s) => s.id === a.sourceId);
    console.log(JSON.stringify({
      sourceId: a.sourceId,
      sourceName: src?.name ?? '(missing)',
      total: a._count._all,
      titleNonNull: a._count.title,
      locationNonNull: a._count.location
    }));
  }

  const recent = await prisma.calendarBusyBlock.findMany({
    take: 40,
    orderBy: { startAt: 'desc' },
    include: { source: { select: { name: true } } }
  });

  console.log('RECENT_BLOCKS');
  for (const b of recent) {
    console.log(JSON.stringify({
      source: b.source.name,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      title: b.title,
      location: b.location,
      isAllDay: b.isAllDay
    }));
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});

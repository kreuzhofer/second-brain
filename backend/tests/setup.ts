// Jest setup file
import { config } from 'dotenv';
import { join } from 'path';
import { getPrismaClient } from '../src/lib/prisma';

// Load environment variables from .env file at the root
config({ path: join(__dirname, '../../.env') });

// Ensure git is available in test PATH (some environments strip PATH)
if (!process.env.PATH || !process.env.PATH.includes('/usr/bin')) {
  const fallbackPaths = ['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin'];
  const current = process.env.PATH ? process.env.PATH.split(':') : [];
  const merged = [...current, ...fallbackPaths.filter((p) => !current.includes(p))];
  process.env.PATH = merged.join(':');
}

const prisma = getPrismaClient();

export async function resetDatabase(): Promise<void> {
  await prisma.entryRevision.deleteMany({});
  await prisma.entryEmbedding.deleteMany({});
  await prisma.entrySection.deleteMany({});
  await prisma.entryLog.deleteMany({});
  await prisma.entryTag.deleteMany({});
  await prisma.tag.deleteMany({});
  await prisma.projectDetails.deleteMany({});
  await prisma.adminTaskDetails.deleteMany({});
  await prisma.ideaDetails.deleteMany({});
  await prisma.personDetails.deleteMany({});
  await prisma.inboxDetails.deleteMany({});
  await prisma.entryAuditLog.deleteMany({});
  await prisma.entry.deleteMany({});

  await prisma.focusSession.deleteMany({});
  await prisma.focusTrack.deleteMany({});

  await prisma.offlineQueueItem.deleteMany({});
  await prisma.digestPreference.deleteMany({});
  await prisma.dailyTipState.deleteMany({});

  await prisma.message.deleteMany({});
  await prisma.conversationSummary.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.emailThread.deleteMany({});
  await prisma.cronJobRun.deleteMany({});
}

beforeAll(async () => {
  await prisma.$connect();
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

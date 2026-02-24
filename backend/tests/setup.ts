// Jest setup file
import { config } from 'dotenv';
import { join } from 'path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getPrismaClient } from '../src/lib/prisma';
import { setDefaultUserId } from '../src/context/user-context';

// Ensure git is available in test PATH (some environments strip PATH)
if (!process.env.PATH || !process.env.PATH.includes('/usr/bin')) {
  const fallbackPaths = ['/usr/bin', '/bin', '/usr/local/bin', '/opt/homebrew/bin'];
  const current = process.env.PATH ? process.env.PATH.split(':') : [];
  const merged = [...current, ...fallbackPaths.filter((p) => !current.includes(p))];
  process.env.PATH = merged.join(':');
}

export const TEST_USER_ID = '00000000-0000-4000-8000-000000000001';
export const TEST_USER_EMAIL = 'test@example.com';
export const TEST_USER_PASSWORD = 'test-password-123';
export const TEST_JWT_SECRET = 'test-jwt-secret';

// Load environment variables from .env file at the root
config({ path: join(__dirname, '../../.env') });

process.env.JWT_SECRET = process.env.JWT_SECRET || TEST_JWT_SECRET;
process.env.DEFAULT_USER_EMAIL = process.env.DEFAULT_USER_EMAIL || TEST_USER_EMAIL;
process.env.DEFAULT_USER_PASSWORD = process.env.DEFAULT_USER_PASSWORD || TEST_USER_PASSWORD;

export function createTestJwt(userId: string = TEST_USER_ID, email: string = TEST_USER_EMAIL): string {
  return jwt.sign({ email }, TEST_JWT_SECRET, {
    subject: userId,
    expiresIn: '1h'
  });
}

const prisma = getPrismaClient();

async function ensureTestUser(): Promise<void> {
  await prisma.user.upsert({
    where: { id: TEST_USER_ID },
    create: {
      id: TEST_USER_ID,
      email: TEST_USER_EMAIL,
      name: 'Test User',
      passwordHash: await bcrypt.hash(TEST_USER_PASSWORD, 10)
    },
    update: {
      email: TEST_USER_EMAIL,
      name: 'Test User',
      passwordHash: await bcrypt.hash(TEST_USER_PASSWORD, 10),
      disabledAt: null
    }
  });

  setDefaultUserId(TEST_USER_ID);
}

export async function resetDatabase(): Promise<void> {
  if (process.env.NODE_ENV !== 'test') {
    throw new Error('resetDatabase can only run when NODE_ENV is "test"');
  }
  await prisma.$transaction([
    prisma.pushSubscription.deleteMany(),
    prisma.calendarBusyBlock.deleteMany(),
    prisma.calendarSource.deleteMany(),
    prisma.calendarSettings.deleteMany(),
    prisma.entryLink.deleteMany(),
    prisma.entryEmbedding.deleteMany(),
    prisma.entryRevision.deleteMany(),
    prisma.entryLog.deleteMany(),
    prisma.entrySection.deleteMany(),
    prisma.entryTag.deleteMany(),
    prisma.entryAuditLog.deleteMany(),
    prisma.entryNudge.deleteMany(),
    prisma.dailyTipState.deleteMany(),
    prisma.offlineQueueItem.deleteMany(),
    prisma.message.deleteMany(),
    prisma.conversationSummary.deleteMany(),
    prisma.conversation.deleteMany(),
    prisma.projectDetails.deleteMany(),
    prisma.adminTaskDetails.deleteMany(),
    prisma.ideaDetails.deleteMany(),
    prisma.personDetails.deleteMany(),
    prisma.inboxDetails.deleteMany(),
    prisma.focusSession.deleteMany(),
    prisma.entry.deleteMany(),
    prisma.tag.deleteMany()
  ]);
  await ensureTestUser();
}

beforeAll(async () => {
  await prisma.$connect();
  await resetDatabase();
});

afterAll(async () => {
  await resetDatabase();
  await prisma.$disconnect();
});

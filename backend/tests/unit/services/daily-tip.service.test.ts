import OpenAI from 'openai';
import { resetDatabase, TEST_USER_ID } from '../../setup';
import { DailyTipService } from '../../../src/services/daily-tip.service';
import { getPrismaClient } from '../../../src/lib/prisma';

describe('DailyTipService', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('stores the generated tip in the database', async () => {
    const openai = createOpenAIMock(['Tip A']);
    const service = new DailyTipService(Math.random, openai);
    const result = await service.getNextTip();

    const prisma = getPrismaClient();
    const record = await prisma.dailyTipState.findUnique({ where: { userId: TEST_USER_ID } });

    expect(result.tip).toBe('Tip A');
    expect(result.source).toBe('ai');
    expect(record?.lastTip).toBe('Tip A');
  });

  it('uses new tips across instances', async () => {
    const openai = createOpenAIMock(['Tip A', 'Tip B']);
    const service = new DailyTipService(Math.random, openai);
    const first = await service.getNextTip();

    const nextService = new DailyTipService(Math.random, openai);
    const second = await nextService.getNextTip();

    expect(first.tip).toBe('Tip A');
    expect(second.tip).toBe('Tip B');
    expect(first.source).toBe('ai');
    expect(second.source).toBe('ai');
  });

  it('uses a weekly-focused prompt when generating weekly tips', async () => {
    const { openai, getLastRequest } = createOpenAIMockWithCapture(['Tip A']);
    const service = new DailyTipService(Math.random, openai);

    await service.getNextTip('weekly');

    const request = getLastRequest();
    const userMessage = request?.messages?.find(message => message.role === 'user')?.content ?? '';
    expect(userMessage.toLowerCase()).toContain('upcoming week');
    expect(userMessage.toLowerCase()).toContain('reward');
  });

  it('returns a fallback tip when OpenAI requests fail', async () => {
    const openai = createOpenAIMockThatThrows();
    const service = new DailyTipService(() => 0.1, openai);
    const result = await service.getNextTip();

    expect(result.source).toBe('fallback');
    expect(result.tip.length).toBeGreaterThan(0);
  });
});

function createOpenAIMock(tips: string[]): OpenAI {
  let index = 0;
  return {
    chat: {
      completions: {
        create: jest.fn().mockImplementation(async () => {
          const tip = tips[Math.min(index, tips.length - 1)];
          index += 1;
          return {
            choices: [{ message: { content: tip } }]
          };
        })
      }
    }
  } as unknown as OpenAI;
}

function createOpenAIMockThatThrows(): OpenAI {
  return {
    chat: {
      completions: {
        create: jest.fn().mockImplementation(async () => {
          throw new Error('OpenAI unavailable');
        })
      }
    }
  } as unknown as OpenAI;
}

function createOpenAIMockWithCapture(tips: string[]): {
  openai: OpenAI;
  getLastRequest: () => {
    model?: string;
    messages?: { role: string; content: string }[];
  } | null;
} {
  let index = 0;
  let lastRequest: { model?: string; messages?: { role: string; content: string }[] } | null = null;

  const openai = {
    chat: {
      completions: {
        create: jest.fn().mockImplementation(async (request) => {
          lastRequest = request;
          const tip = tips[Math.min(index, tips.length - 1)];
          index += 1;
          return {
            choices: [{ message: { content: tip } }]
          };
        })
      }
    }
  } as unknown as OpenAI;

  return {
    openai,
    getLastRequest: () => lastRequest
  };
}

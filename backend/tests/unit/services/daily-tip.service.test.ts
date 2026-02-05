import OpenAI from 'openai';
import { resetDatabase } from '../../setup';
import { DailyTipService } from '../../../src/services/daily-tip.service';
import { getPrismaClient } from '../../../src/lib/prisma';

describe('DailyTipService', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('stores the generated tip in the database', async () => {
    const openai = createOpenAIMock(['Tip A']);
    const service = new DailyTipService(Math.random, openai);
    const tip = await service.getNextTip();

    const prisma = getPrismaClient();
    const record = await prisma.dailyTipState.findUnique({ where: { id: 'default' } });

    expect(tip).toBe('Tip A');
    expect(record?.lastTip).toBe('Tip A');
  });

  it('uses new tips across instances', async () => {
    const openai = createOpenAIMock(['Tip A', 'Tip B']);
    const service = new DailyTipService(Math.random, openai);
    const first = await service.getNextTip();

    const nextService = new DailyTipService(Math.random, openai);
    const second = await nextService.getNextTip();

    expect(first).toBe('Tip A');
    expect(second).toBe('Tip B');
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

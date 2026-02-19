import { DigestService } from '../../../src/services/digest.service';
import { DigestPreferences } from '../../../src/services/digest-preferences.service';

const basePrefs: DigestPreferences = {
  includeNudges: true,
  maxNudgesPerDay: 2,
  nudgeCooldownDays: 3
};

describe('DigestService - Smart Nudges', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-02-18T12:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('selects top candidates based on deadline and inactivity', async () => {
    const entryService = {
      list: jest.fn()
    } as any;

    entryService.list
      .mockResolvedValueOnce([
        {
          id: 'task-1',
          path: 'task/overdue-task',
          name: 'Overdue task',
          category: 'task',
          status: 'pending',
          updated_at: '2026-02-10T10:00:00.000Z',
          due_date: '2026-02-17',
          priority: 5
        },
        {
          id: 'task-2',
          path: 'task/due-soon',
          name: 'Due soon task',
          category: 'task',
          status: 'pending',
          updated_at: '2026-02-16T10:00:00.000Z',
          due_date: '2026-02-19',
          priority: 3
        }
      ])
      .mockResolvedValueOnce([
        {
          id: 'project-1',
          path: 'projects/stale-project',
          name: 'Stale project',
          category: 'projects',
          status: 'active',
          updated_at: '2026-01-01T10:00:00.000Z'
        }
      ]);

    const prisma = {
      entryNudge: {
        findMany: jest.fn().mockResolvedValue([]),
        upsert: jest.fn().mockResolvedValue({})
      }
    } as any;

    const digestService = new DigestService(entryService, null, null, null, undefined, undefined, prisma);

    const nudges = await digestService.getSmartNudges(basePrefs);

    expect(entryService.list).toHaveBeenCalledTimes(2);
    expect(entryService.list).toHaveBeenNthCalledWith(1, 'task', { status: 'pending' });
    expect(entryService.list).toHaveBeenNthCalledWith(2, 'projects', { status: 'active' });
    expect(nudges).toHaveLength(2);
    expect(nudges[0].name).toBe('Overdue task');
    expect(nudges[1].name).toBe('Due soon task');
    expect(prisma.entryNudge.upsert).toHaveBeenCalledTimes(2);
  });

  it('suppresses nudges within the cooldown window', async () => {
    const entryService = {
      list: jest.fn()
    } as any;

    entryService.list
      .mockResolvedValueOnce([
        {
          id: 'task-1',
          path: 'task/overdue-task',
          name: 'Overdue task',
          category: 'task',
          status: 'pending',
          updated_at: '2026-02-10T10:00:00.000Z',
          due_date: '2026-02-17',
          priority: 5
        },
        {
          id: 'task-2',
          path: 'task/due-soon',
          name: 'Due soon task',
          category: 'task',
          status: 'pending',
          updated_at: '2026-02-16T10:00:00.000Z',
          due_date: '2026-02-19',
          priority: 3
        }
      ])
      .mockResolvedValueOnce([]);

    const prisma = {
      entryNudge: {
        findMany: jest.fn().mockResolvedValue([
          {
            entryId: 'task-1',
            lastNudgedAt: new Date('2026-02-17T12:00:00Z')
          }
        ]),
        upsert: jest.fn().mockResolvedValue({})
      }
    } as any;

    const digestService = new DigestService(entryService, null, null, null, undefined, undefined, prisma);

    const nudges = await digestService.getSmartNudges({
      ...basePrefs,
      maxNudgesPerDay: 3,
      nudgeCooldownDays: 3
    });

    expect(entryService.list).toHaveBeenNthCalledWith(1, 'task', { status: 'pending' });
    expect(entryService.list).toHaveBeenNthCalledWith(2, 'projects', { status: 'active' });
    expect(nudges).toHaveLength(1);
    expect(nudges[0].name).toBe('Due soon task');
    expect(prisma.entryNudge.upsert).toHaveBeenCalledTimes(1);
  });
});

import { handleListEntries } from '../../../src/mcp/tools/list-entries';

describe('list_entries tool', () => {
  const mockEntryService = {
    list: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists entries with optional filters', async () => {
    mockEntryService.list.mockResolvedValue([
      {
        id: 'e1',
        path: 'projects/app',
        name: 'App',
        category: 'projects',
        updated_at: '2026-01-01T00:00:00Z',
        status: 'active'
      },
      {
        id: 'e2',
        path: 'projects/done-thing',
        name: 'Done Thing',
        category: 'projects',
        updated_at: '2025-12-01T00:00:00Z',
        status: 'done'
      }
    ]);

    const result = await handleListEntries(
      { category: 'projects', status: 'active' },
      mockEntryService as any
    );

    expect(mockEntryService.list).toHaveBeenCalledWith('projects', { status: 'active' });
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('App');
  });

  it('defaults limit to 20', async () => {
    const entries = Array.from({ length: 25 }, (_, i) => ({
      id: `e${i}`,
      path: `memory/mem-${i}`,
      name: `Memory ${i}`,
      category: 'memory',
      updated_at: '2026-01-01T00:00:00Z'
    }));
    mockEntryService.list.mockResolvedValue(entries);

    const result = await handleListEntries({}, mockEntryService as any);

    expect(result).toHaveLength(20);
  });

  it('respects custom limit', async () => {
    const entries = Array.from({ length: 10 }, (_, i) => ({
      id: `e${i}`,
      path: `memory/mem-${i}`,
      name: `Memory ${i}`,
      category: 'memory',
      updated_at: '2026-01-01T00:00:00Z'
    }));
    mockEntryService.list.mockResolvedValue(entries);

    const result = await handleListEntries({ limit: 3 }, mockEntryService as any);

    expect(result).toHaveLength(3);
  });

  it('includes memory-specific fields', async () => {
    mockEntryService.list.mockResolvedValue([
      {
        id: 'e1',
        path: 'memory/pref',
        name: 'Preference',
        category: 'memory',
        updated_at: '2026-01-01T00:00:00Z',
        agent_name: 'Claude Code',
        memory_type: 'preference'
      }
    ]);

    const result = await handleListEntries(
      { category: 'memory' },
      mockEntryService as any
    );

    expect(result[0].agent_name).toBe('Claude Code');
    expect(result[0].memory_type).toBe('preference');
  });
});

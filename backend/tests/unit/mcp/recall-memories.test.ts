import { handleRecallMemories } from '../../../src/mcp/tools/recall-memories';

describe('recall_memories tool', () => {
  const mockEntryService = {
    read: jest.fn()
  };

  const mockSearchService = {
    search: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('searches with category=memory and returns enriched results', async () => {
    mockSearchService.search.mockResolvedValue({
      entries: [
        { path: 'memory/pref-dark', name: 'Dark Mode', category: 'memory', snippet: '...', score: 0.95 }
      ],
      total: 1
    });

    mockEntryService.read.mockResolvedValue({
      path: 'memory/pref-dark',
      category: 'memory',
      entry: {
        id: 'e1',
        name: 'Dark Mode',
        memory_type: 'preference',
        agent_name: 'Claude Code',
        created_at: '2026-01-01T00:00:00.000Z'
      },
      content: 'User prefers dark mode'
    });

    const result = await handleRecallMemories(
      { query: 'dark mode' },
      mockEntryService as any,
      mockSearchService as any
    );

    expect(mockSearchService.search).toHaveBeenCalledWith('dark mode', {
      category: 'memory',
      limit: 10
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      title: 'Dark Mode',
      content: 'User prefers dark mode',
      memory_type: 'preference',
      agent_name: 'Claude Code',
      score: 0.95,
      created_at: '2026-01-01T00:00:00.000Z'
    });
  });

  it('filters by memory_type', async () => {
    mockSearchService.search.mockResolvedValue({
      entries: [
        { path: 'memory/fact-1', name: 'Fact', category: 'memory', snippet: '', score: 0.9 },
        { path: 'memory/pref-1', name: 'Pref', category: 'memory', snippet: '', score: 0.8 }
      ],
      total: 2
    });

    mockEntryService.read
      .mockResolvedValueOnce({
        path: 'memory/fact-1',
        category: 'memory',
        entry: { memory_type: 'fact', agent_name: 'Agent', created_at: '' },
        content: 'A fact'
      })
      .mockResolvedValueOnce({
        path: 'memory/pref-1',
        category: 'memory',
        entry: { memory_type: 'preference', agent_name: 'Agent', created_at: '' },
        content: 'A pref'
      });

    const result = await handleRecallMemories(
      { query: 'test', memory_type: 'fact' },
      mockEntryService as any,
      mockSearchService as any
    );

    expect(result).toHaveLength(1);
    expect(result[0].memory_type).toBe('fact');
  });

  it('filters by agent_id', async () => {
    mockSearchService.search.mockResolvedValue({
      entries: [
        { path: 'memory/m1', name: 'M1', category: 'memory', snippet: '', score: 0.9 }
      ],
      total: 1
    });

    mockEntryService.read.mockResolvedValue({
      path: 'memory/m1',
      category: 'memory',
      entry: { memory_type: 'fact', agent_id: 'other-agent', agent_name: 'Other', created_at: '' },
      content: 'Content'
    });

    const result = await handleRecallMemories(
      { query: 'test', agent_id: 'claude-code' },
      mockEntryService as any,
      mockSearchService as any
    );

    expect(result).toHaveLength(0);
  });

  it('respects limit parameter', async () => {
    mockSearchService.search.mockResolvedValue({ entries: [], total: 0 });

    await handleRecallMemories(
      { query: 'test', limit: 5 },
      mockEntryService as any,
      mockSearchService as any
    );

    expect(mockSearchService.search).toHaveBeenCalledWith('test', {
      category: 'memory',
      limit: 5
    });
  });

  it('skips entries that fail to read', async () => {
    mockSearchService.search.mockResolvedValue({
      entries: [
        { path: 'memory/broken', name: 'Broken', category: 'memory', snippet: '', score: 0.9 }
      ],
      total: 1
    });

    mockEntryService.read.mockRejectedValue(new Error('Not found'));

    const result = await handleRecallMemories(
      { query: 'test' },
      mockEntryService as any,
      mockSearchService as any
    );

    expect(result).toHaveLength(0);
  });
});

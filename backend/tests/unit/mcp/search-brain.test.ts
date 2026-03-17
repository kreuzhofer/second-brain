import { handleSearchBrain } from '../../../src/mcp/tools/search-brain';

describe('search_brain tool', () => {
  const mockSearchService = {
    search: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes query and options to search service', async () => {
    mockSearchService.search.mockResolvedValue({
      entries: [
        {
          path: 'projects/my-app',
          name: 'My App',
          category: 'projects',
          matchedField: 'name',
          snippet: 'My App project',
          score: 0.95
        }
      ],
      total: 1
    });

    const result = await handleSearchBrain(
      { query: 'my app', category: 'projects', limit: 5 },
      mockSearchService as any
    );

    expect(mockSearchService.search).toHaveBeenCalledWith('my app', {
      category: 'projects',
      limit: 5
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      path: 'projects/my-app',
      name: 'My App',
      category: 'projects',
      snippet: 'My App project',
      score: 0.95
    });
  });

  it('defaults limit to 10', async () => {
    mockSearchService.search.mockResolvedValue({ entries: [], total: 0 });

    await handleSearchBrain(
      { query: 'test' },
      mockSearchService as any
    );

    expect(mockSearchService.search).toHaveBeenCalledWith('test', {
      category: undefined,
      limit: 10
    });
  });

  it('returns empty array for no results', async () => {
    mockSearchService.search.mockResolvedValue({ entries: [], total: 0 });

    const result = await handleSearchBrain(
      { query: 'nonexistent' },
      mockSearchService as any
    );

    expect(result).toEqual([]);
  });
});

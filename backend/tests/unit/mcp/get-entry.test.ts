import { handleGetEntry } from '../../../src/mcp/tools/get-entry';

describe('get_entry tool', () => {
  const mockEntryService = {
    read: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads an entry by path', async () => {
    mockEntryService.read.mockResolvedValue({
      path: 'projects/my-app',
      category: 'projects',
      entry: {
        id: 'e1',
        name: 'My App',
        status: 'active',
        next_action: 'Ship MVP'
      },
      content: '# My App\nA great project'
    });

    const result = await handleGetEntry(
      { path: 'projects/my-app' },
      mockEntryService as any
    );

    expect(mockEntryService.read).toHaveBeenCalledWith('projects/my-app');
    expect(result.path).toBe('projects/my-app');
    expect(result.category).toBe('projects');
    expect(result.content).toBe('# My App\nA great project');
    expect(result.entry).toEqual(expect.objectContaining({ name: 'My App' }));
  });

  it('propagates errors from entry service', async () => {
    mockEntryService.read.mockRejectedValue(new Error('Entry not found: bad/path'));

    await expect(
      handleGetEntry({ path: 'bad/path' }, mockEntryService as any)
    ).rejects.toThrow('Entry not found');
  });
});

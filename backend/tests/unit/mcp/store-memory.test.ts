import { handleStoreMemory, StoreMemoryInput } from '../../../src/mcp/tools/store-memory';

describe('store_memory tool', () => {
  const mockEntryService = {
    create: jest.fn()
  };

  const mockSearchService = {
    ensureEmbedding: jest.fn()
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockEntryService.create.mockResolvedValue({
      path: 'memory/test-memory',
      category: 'memory',
      entry: { id: 'entry-123', name: 'Test Memory' },
      content: 'Test content'
    });
  });

  it('creates a memory entry with correct parameters', async () => {
    const input: StoreMemoryInput = {
      title: 'Test Memory',
      content: 'User prefers dark mode',
      memory_type: 'preference'
    };

    const result = await handleStoreMemory(
      input,
      'claude-code',
      'Claude Code',
      mockEntryService as any,
      mockSearchService as any
    );

    expect(result.path).toBe('memory/test-memory');
    expect(result.id).toBe('entry-123');
    expect(result.message).toBe('Memory stored');

    expect(mockEntryService.create).toHaveBeenCalledWith(
      'memory',
      expect.objectContaining({
        name: 'Test Memory',
        agent_id: 'claude-code',
        agent_name: 'Claude Code',
        memory_type: 'preference',
        confidence: 1.0,
        source_channel: 'api'
      }),
      'api',
      'User prefers dark mode'
    );
  });

  it('passes optional fields through', async () => {
    const input: StoreMemoryInput = {
      title: 'Expiring Memory',
      content: 'Temporary context',
      memory_type: 'context',
      confidence: 0.8,
      expires_at: '2026-12-31T23:59:59Z',
      source_conversation_id: 'conv-456',
      tags: ['temporary']
    };

    await handleStoreMemory(
      input,
      'test-agent',
      'Test Agent',
      mockEntryService as any,
      mockSearchService as any
    );

    expect(mockEntryService.create).toHaveBeenCalledWith(
      'memory',
      expect.objectContaining({
        confidence: 0.8,
        expires_at: '2026-12-31T23:59:59Z',
        source_conversation_id: 'conv-456',
        tags: ['temporary']
      }),
      'api',
      'Temporary context'
    );
  });

  it('defaults confidence to 1.0', async () => {
    const input: StoreMemoryInput = {
      title: 'Fact',
      content: 'User works at Acme',
      memory_type: 'fact'
    };

    await handleStoreMemory(
      input,
      'agent',
      'Agent',
      mockEntryService as any,
      mockSearchService as any
    );

    expect(mockEntryService.create).toHaveBeenCalledWith(
      'memory',
      expect.objectContaining({ confidence: 1.0 }),
      'api',
      'User works at Acme'
    );
  });

  it('attempts embedding generation but does not fail if it errors', async () => {
    mockSearchService.ensureEmbedding.mockRejectedValue(new Error('No API key'));

    const input: StoreMemoryInput = {
      title: 'Memory',
      content: 'Content',
      memory_type: 'fact'
    };

    const result = await handleStoreMemory(
      input,
      'agent',
      'Agent',
      mockEntryService as any,
      mockSearchService as any
    );

    expect(result.message).toBe('Memory stored');
  });
});

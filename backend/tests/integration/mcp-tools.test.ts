import { resetDatabase } from '../setup';
import { EntryService } from '../../src/services/entry.service';
import { handleStoreMemory } from '../../src/mcp/tools/store-memory';
import { handleRecallMemories } from '../../src/mcp/tools/recall-memories';
import { handleSearchBrain } from '../../src/mcp/tools/search-brain';
import { handleGetEntry } from '../../src/mcp/tools/get-entry';
import { handleListEntries } from '../../src/mcp/tools/list-entries';
import { SearchService } from '../../src/services/search.service';

describe('MCP tools integration', () => {
  let entryService: EntryService;
  let searchService: SearchService;

  beforeEach(async () => {
    await resetDatabase();
    entryService = new EntryService();
    // Disable semantic search for integration tests (no OpenAI key)
    searchService = new SearchService(entryService, undefined, {
      enableSemantic: false
    });
  });

  describe('store_memory + recall_memories', () => {
    it('stores a memory and recalls it by keyword search', async () => {
      const stored = await handleStoreMemory(
        {
          title: 'Dark Mode Preference',
          content: 'The user strongly prefers dark mode in all applications and IDEs',
          memory_type: 'preference',
          tags: ['ui', 'editor']
        },
        'claude-code',
        'Claude Code',
        entryService,
        searchService
      );

      expect(stored.path).toBe('memory/dark-mode-preference');
      expect(stored.message).toBe('Memory stored');

      const recalled = await handleRecallMemories(
        { query: 'dark mode' },
        entryService,
        searchService
      );

      expect(recalled.length).toBeGreaterThanOrEqual(1);
      expect(recalled[0].title).toBe('Dark Mode Preference');
      expect(recalled[0].content).toContain('dark mode');
      expect(recalled[0].memory_type).toBe('preference');
      expect(recalled[0].agent_name).toBe('Claude Code');
    });
  });

  describe('store_memory + list_entries', () => {
    it('stored memories appear in list with category=memory', async () => {
      await handleStoreMemory(
        {
          title: 'Work at Acme',
          content: 'User works at Acme Corp as a senior engineer',
          memory_type: 'fact'
        },
        'claude-code',
        'Claude Code',
        entryService,
        searchService
      );

      const list = await handleListEntries(
        { category: 'memory' },
        entryService
      );

      expect(list.length).toBeGreaterThanOrEqual(1);
      const found = list.find((e) => e.name === 'Work at Acme');
      expect(found).toBeDefined();
      expect(found!.category).toBe('memory');
      expect(found!.memory_type).toBe('fact');
      expect(found!.agent_name).toBe('Claude Code');
    });
  });

  describe('search_brain across categories', () => {
    it('finds a project entry via search', async () => {
      await entryService.create(
        'projects',
        {
          name: 'MCP Server Project',
          next_action: 'Implement tools',
          status: 'active',
          source_channel: 'api',
          confidence: 1.0
        },
        'api',
        'Building an MCP server for the second brain'
      );

      const results = await handleSearchBrain(
        { query: 'MCP Server' },
        searchService
      );

      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results[0].path).toBe('projects/mcp-server-project');
      expect(results[0].category).toBe('projects');
    });
  });

  describe('store_memory + get_entry', () => {
    it('retrieves full memory content by path', async () => {
      await handleStoreMemory(
        {
          title: 'Coding Style',
          content: 'User prefers functional style with immutable data structures',
          memory_type: 'preference',
          confidence: 0.9
        },
        'claude-code',
        'Claude Code',
        entryService,
        searchService
      );

      const entry = await handleGetEntry(
        { path: 'memory/coding-style' },
        entryService
      );

      expect(entry.path).toBe('memory/coding-style');
      expect(entry.category).toBe('memory');
      expect(entry.content).toContain('functional style');
      expect((entry.entry as any).memory_type).toBe('preference');
      expect((entry.entry as any).agent_name).toBe('Claude Code');
      expect((entry.entry as any).confidence).toBe(0.9);
    });
  });
});

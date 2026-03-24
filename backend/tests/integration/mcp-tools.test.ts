import { resetDatabase } from '../setup';
import { EntryService } from '../../src/services/entry.service';
import { handleStoreMemory } from '../../src/mcp/tools/store-memory';
import { handleRecallMemories } from '../../src/mcp/tools/recall-memories';
import { handleSearchBrain } from '../../src/mcp/tools/search-brain';
import { handleGetEntry } from '../../src/mcp/tools/get-entry';
import { handleListEntries } from '../../src/mcp/tools/list-entries';
import { SearchService } from '../../src/services/search.service';
import { handleCreateTask } from '../../src/mcp/tools/create-task';
import { handleUpdateTask } from '../../src/mcp/tools/update-task';
import { handleListTasks } from '../../src/mcp/tools/list-tasks';

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

  describe('create_task', () => {
    it('creates a task and retrieves it via get_entry', async () => {
      const result = await handleCreateTask(
        { name: 'Buy groceries', priority: 2, tags: ['errands'] },
        entryService,
        searchService
      );

      expect(result.path).toBe('task/buy-groceries');
      expect(result.message).toBe('Task created');
      expect(result.id).toBeDefined();

      const entry = await handleGetEntry({ path: 'task/buy-groceries' }, entryService);
      expect(entry.category).toBe('task');
      expect((entry.entry as any).status).toBe('pending');
      expect((entry.entry as any).priority).toBe(2);
    });

    it('creates a task with all fields', async () => {
      const result = await handleCreateTask(
        {
          name: 'Dentist Appointment',
          due_date: '2026-04-01',
          duration_minutes: 60,
          priority: 1,
          tags: ['health'],
          description: 'Annual checkup at Dr. Smith'
        },
        entryService,
        searchService
      );

      expect(result.path).toBe('task/dentist-appointment');

      const entry = await handleGetEntry({ path: 'task/dentist-appointment' }, entryService);
      expect((entry.entry as any).due_date).toBe('2026-04-01');
      expect((entry.entry as any).duration_minutes).toBe(60);
      expect((entry.entry as any).priority).toBe(1);
      expect(entry.content).toContain('Annual checkup');
    });
  });

  describe('update_task', () => {
    it('marks a task as done', async () => {
      await handleCreateTask(
        { name: 'File taxes' },
        entryService,
        searchService
      );

      const updated = await handleUpdateTask(
        { path: 'task/file-taxes', status: 'done' },
        entryService
      );

      expect(updated.message).toBe('Task marked as done');

      const entry = await handleGetEntry({ path: 'task/file-taxes' }, entryService);
      expect((entry.entry as any).status).toBe('done');
    });

    it('updates task fields', async () => {
      await handleCreateTask(
        { name: 'Review PR' },
        entryService,
        searchService
      );

      await handleUpdateTask(
        { path: 'task/review-pr', priority: 1, due_date: '2026-03-25' },
        entryService
      );

      const entry = await handleGetEntry({ path: 'task/review-pr' }, entryService);
      expect((entry.entry as any).priority).toBe(1);
      expect((entry.entry as any).due_date).toBe('2026-03-25');
    });

    it('rejects non-task paths', async () => {
      await expect(
        handleUpdateTask({ path: 'projects/foo', status: 'done' }, entryService)
      ).rejects.toThrow('Task paths must start with "task/"');
    });
  });

  describe('list_tasks', () => {
    it('lists only pending tasks by default', async () => {
      await handleCreateTask({ name: 'Task A' }, entryService, searchService);
      await handleCreateTask({ name: 'Task B' }, entryService, searchService);
      await handleUpdateTask({ path: 'task/task-b', status: 'done' }, entryService);

      const pending = await handleListTasks({}, entryService);
      expect(pending.length).toBe(1);
      expect(pending[0].name).toBe('Task A');
      expect(pending[0].status).toBe('pending');
    });

    it('lists all tasks when include_done is true', async () => {
      await handleCreateTask({ name: 'Task C' }, entryService, searchService);
      await handleCreateTask({ name: 'Task D' }, entryService, searchService);
      await handleUpdateTask({ path: 'task/task-d', status: 'done' }, entryService);

      const all = await handleListTasks({ include_done: true }, entryService);
      expect(all.length).toBe(2);
    });

    it('filters by done status', async () => {
      await handleCreateTask({ name: 'Task E' }, entryService, searchService);
      await handleCreateTask({ name: 'Task F' }, entryService, searchService);
      await handleUpdateTask({ path: 'task/task-f', status: 'done' }, entryService);

      const done = await handleListTasks({ status: 'done' }, entryService);
      expect(done.length).toBe(1);
      expect(done[0].name).toBe('Task F');
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

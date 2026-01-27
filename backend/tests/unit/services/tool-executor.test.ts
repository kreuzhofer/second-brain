/**
 * Unit tests for ToolExecutor
 * Tests the tool execution dispatch and validation logic
 */

import {
  ToolExecutor,
  ToolCall,
  CaptureResult,
  ListEntriesResult,
  GetEntryResult,
  DigestResult,
  UpdateEntryResult,
  getToolExecutor,
  resetToolExecutor
} from '../../../src/services/tool-executor';
import { ToolRegistry, resetToolRegistry } from '../../../src/services/tool-registry';
import { EntryService } from '../../../src/services/entry.service';
import { ClassificationAgent } from '../../../src/services/classification.service';
import { DigestService } from '../../../src/services/digest.service';
import { SearchService } from '../../../src/services/search.service';
import { IndexService } from '../../../src/services/index.service';
import { ClassificationResult } from '../../../src/types/chat.types';
import { EntryWithPath, EntrySummary } from '../../../src/types/entry.types';

// Mock the services to avoid file system dependencies
jest.mock('../../../src/services/entry.service', () => ({
  EntryService: jest.fn().mockImplementation(() => ({})),
  getEntryService: jest.fn().mockReturnValue({})
}));

jest.mock('../../../src/services/classification.service', () => ({
  ClassificationAgent: jest.fn().mockImplementation(() => ({})),
  getClassificationAgent: jest.fn().mockReturnValue({})
}));

jest.mock('../../../src/services/digest.service', () => ({
  DigestService: jest.fn().mockImplementation(() => ({})),
  getDigestService: jest.fn().mockReturnValue({})
}));

jest.mock('../../../src/services/search.service', () => ({
  SearchService: jest.fn().mockImplementation(() => ({})),
  getSearchService: jest.fn().mockReturnValue({})
}));

jest.mock('../../../src/services/index.service', () => ({
  IndexService: jest.fn().mockImplementation(() => ({})),
  getIndexService: jest.fn().mockReturnValue({})
}));

describe('ToolExecutor', () => {
  let toolExecutor: ToolExecutor;
  let mockToolRegistry: ToolRegistry;
  let mockEntryService: jest.Mocked<EntryService>;
  let mockClassificationAgent: jest.Mocked<ClassificationAgent>;
  let mockDigestService: jest.Mocked<DigestService>;
  let mockSearchService: jest.Mocked<SearchService>;
  let mockIndexService: jest.Mocked<IndexService>;

  beforeEach(() => {
    resetToolExecutor();
    resetToolRegistry();
    
    mockToolRegistry = new ToolRegistry();
    mockEntryService = {
      create: jest.fn(),
      read: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      list: jest.fn()
    } as unknown as jest.Mocked<EntryService>;
    mockClassificationAgent = {
      classify: jest.fn()
    } as unknown as jest.Mocked<ClassificationAgent>;
    mockDigestService = {} as jest.Mocked<DigestService>;
    mockSearchService = {} as jest.Mocked<SearchService>;
    mockIndexService = {
      getIndexContent: jest.fn().mockResolvedValue('# Index\n\nTest index content'),
      regenerate: jest.fn()
    } as unknown as jest.Mocked<IndexService>;
    
    toolExecutor = new ToolExecutor(
      mockToolRegistry,
      mockEntryService,
      mockClassificationAgent,
      mockDigestService,
      mockSearchService,
      mockIndexService
    );
  });

  describe('execute()', () => {
    it('should return error for unknown tool', async () => {
      const toolCall: ToolCall = {
        name: 'unknown_tool',
        arguments: {}
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown tool');
    });

    it('should return validation error for invalid arguments', async () => {
      const toolCall: ToolCall = {
        name: 'classify_and_capture',
        arguments: {} // Missing required 'text' field
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(result.error).toContain('text');
    });

    it('should return validation error for wrong argument type', async () => {
      const toolCall: ToolCall = {
        name: 'classify_and_capture',
        arguments: { text: 123 } // Should be string
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('should return validation error for invalid enum value', async () => {
      const toolCall: ToolCall = {
        name: 'generate_digest',
        arguments: { type: 'monthly' } // Invalid enum value
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('should dispatch to classify_and_capture handler with high confidence', async () => {
      // Mock classification result with high confidence (>= 0.6)
      const mockClassificationResult: ClassificationResult = {
        category: 'projects',
        confidence: 0.85,
        name: 'Test Project',
        slug: 'test-project',
        fields: {
          status: 'active',
          nextAction: 'Start working on it',
          relatedPeople: [],
          dueDate: undefined
        },
        relatedEntries: [],
        reasoning: 'This is clearly a project'
      };
      mockClassificationAgent.classify.mockResolvedValue(mockClassificationResult);

      // Mock entry creation
      const mockCreatedEntry: EntryWithPath = {
        path: 'projects/test-project.md',
        category: 'projects',
        entry: {
          id: 'test-id',
          name: 'Test Project',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_channel: 'api',
          confidence: 0.85,
          status: 'active',
          next_action: 'Start working on it',
          related_people: []
        },
        content: ''
      };
      mockEntryService.create.mockResolvedValue(mockCreatedEntry);

      const toolCall: ToolCall = {
        name: 'classify_and_capture',
        arguments: { text: 'Test thought about a project' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const captureResult = result.data as CaptureResult;
      expect(captureResult.path).toBe('projects/test-project.md');
      expect(captureResult.category).toBe('projects');
      expect(captureResult.name).toBe('Test Project');
      expect(captureResult.confidence).toBe(0.85);
      expect(captureResult.clarificationNeeded).toBe(false);

      // Verify classification was called
      expect(mockClassificationAgent.classify).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Test thought about a project',
          context: expect.objectContaining({
            indexContent: '# Index\n\nTest index content',
            summaries: [],
            recentMessages: []
          })
        })
      );

      // Verify entry was created in the classified category (not inbox)
      expect(mockEntryService.create).toHaveBeenCalledWith(
        'projects',
        expect.objectContaining({
          name: 'Test Project',
          confidence: 0.85,
          source_channel: 'api'
        }),
        'api'
      );
    });

    it('should route to inbox when confidence is low', async () => {
      // Mock classification result with low confidence (< 0.6)
      const mockClassificationResult: ClassificationResult = {
        category: 'ideas',
        confidence: 0.45,
        name: 'Unclear Thought',
        slug: 'unclear-thought',
        fields: {
          oneLiner: 'Something unclear',
          relatedProjects: []
        },
        relatedEntries: [],
        reasoning: 'Not sure what this is'
      };
      mockClassificationAgent.classify.mockResolvedValue(mockClassificationResult);

      // Mock inbox entry creation
      const mockCreatedEntry: EntryWithPath = {
        path: 'inbox/20240101120000-unclear-thought.md',
        category: 'inbox',
        entry: {
          id: 'test-id',
          original_text: 'Some unclear thought',
          suggested_category: 'ideas',
          suggested_name: 'Unclear Thought',
          confidence: 0.45,
          status: 'needs_review',
          source_channel: 'api',
          created_at: new Date().toISOString()
        },
        content: ''
      };
      mockEntryService.create.mockResolvedValue(mockCreatedEntry);

      const toolCall: ToolCall = {
        name: 'classify_and_capture',
        arguments: { text: 'Some unclear thought' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const captureResult = result.data as CaptureResult;
      expect(captureResult.category).toBe('inbox');
      expect(captureResult.confidence).toBe(0.45);
      expect(captureResult.clarificationNeeded).toBe(true);

      // Verify entry was created in inbox
      expect(mockEntryService.create).toHaveBeenCalledWith(
        'inbox',
        expect.objectContaining({
          original_text: 'Some unclear thought',
          suggested_category: 'ideas',
          suggested_name: 'Unclear Thought',
          confidence: 0.45,
          source_channel: 'api'
        }),
        'api'
      );
    });

    it('should pass hints to classification agent', async () => {
      const mockClassificationResult: ClassificationResult = {
        category: 'people',
        confidence: 0.9,
        name: 'John Doe',
        slug: 'john-doe',
        fields: {
          context: 'Met at conference',
          followUps: [],
          relatedProjects: []
        },
        relatedEntries: [],
        reasoning: 'Hint indicated person'
      };
      mockClassificationAgent.classify.mockResolvedValue(mockClassificationResult);

      const mockCreatedEntry: EntryWithPath = {
        path: 'people/john-doe.md',
        category: 'people',
        entry: {
          id: 'test-id',
          name: 'John Doe',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_channel: 'api',
          confidence: 0.9,
          context: 'Met at conference',
          follow_ups: [],
          related_projects: [],
          last_touched: new Date().toISOString().split('T')[0]
        },
        content: ''
      };
      mockEntryService.create.mockResolvedValue(mockCreatedEntry);

      const toolCall: ToolCall = {
        name: 'classify_and_capture',
        arguments: { 
          text: 'Met John Doe at the tech conference',
          hints: '[person]'
        }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(mockClassificationAgent.classify).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Met John Doe at the tech conference',
          hints: '[person]'
        })
      );
    });

    it('should handle classification errors gracefully', async () => {
      mockClassificationAgent.classify.mockRejectedValue(new Error('Classification failed'));

      const toolCall: ToolCall = {
        name: 'classify_and_capture',
        arguments: { text: 'Test thought' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Classification failed');
    });
  });

  describe('list_entries handler', () => {
    it('should return all entries when no filters provided', async () => {
      const mockEntries: EntrySummary[] = [
        { path: 'projects/project-a.md', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' },
        { path: 'people/john-doe.md', name: 'John Doe', category: 'people', updated_at: '2024-01-02T12:00:00Z' },
        { path: 'ideas/new-idea.md', name: 'New Idea', category: 'ideas', updated_at: '2024-01-03T12:00:00Z', one_liner: 'A great idea' }
      ];
      mockEntryService.list.mockResolvedValue(mockEntries);

      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: {}
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const listResult = result.data as ListEntriesResult;
      expect(listResult.entries).toHaveLength(3);
      expect(listResult.total).toBe(3);
      expect(mockEntryService.list).toHaveBeenCalledWith(undefined, undefined);
    });

    it('should filter by category when provided', async () => {
      const mockEntries: EntrySummary[] = [
        { path: 'projects/project-a.md', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' },
        { path: 'projects/project-b.md', name: 'Project B', category: 'projects', updated_at: '2024-01-02T12:00:00Z', status: 'waiting' }
      ];
      mockEntryService.list.mockResolvedValue(mockEntries);

      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: { category: 'projects' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      const listResult = result.data as ListEntriesResult;
      expect(listResult.entries).toHaveLength(2);
      expect(listResult.total).toBe(2);
      expect(mockEntryService.list).toHaveBeenCalledWith('projects', undefined);
    });

    it('should filter by status when provided', async () => {
      const mockEntries: EntrySummary[] = [
        { path: 'projects/project-a.md', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' }
      ];
      mockEntryService.list.mockResolvedValue(mockEntries);

      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: { status: 'active' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      const listResult = result.data as ListEntriesResult;
      expect(listResult.entries).toHaveLength(1);
      expect(mockEntryService.list).toHaveBeenCalledWith(undefined, { status: 'active' });
    });

    it('should filter by both category and status when provided', async () => {
      const mockEntries: EntrySummary[] = [
        { path: 'projects/project-a.md', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' }
      ];
      mockEntryService.list.mockResolvedValue(mockEntries);

      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: { category: 'projects', status: 'active' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      const listResult = result.data as ListEntriesResult;
      expect(listResult.entries).toHaveLength(1);
      expect(mockEntryService.list).toHaveBeenCalledWith('projects', { status: 'active' });
    });

    it('should apply limit to results', async () => {
      const mockEntries: EntrySummary[] = [
        { path: 'projects/project-a.md', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' },
        { path: 'projects/project-b.md', name: 'Project B', category: 'projects', updated_at: '2024-01-02T12:00:00Z', status: 'active' },
        { path: 'projects/project-c.md', name: 'Project C', category: 'projects', updated_at: '2024-01-03T12:00:00Z', status: 'active' },
        { path: 'projects/project-d.md', name: 'Project D', category: 'projects', updated_at: '2024-01-04T12:00:00Z', status: 'active' },
        { path: 'projects/project-e.md', name: 'Project E', category: 'projects', updated_at: '2024-01-05T12:00:00Z', status: 'active' }
      ];
      mockEntryService.list.mockResolvedValue(mockEntries);

      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: { limit: 3 }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      const listResult = result.data as ListEntriesResult;
      expect(listResult.entries).toHaveLength(3);
      expect(listResult.total).toBe(5); // Total is count BEFORE limit
    });

    it('should use default limit of 10 when not provided', async () => {
      // Create 15 mock entries
      const mockEntries: EntrySummary[] = Array.from({ length: 15 }, (_, i) => ({
        path: `projects/project-${i}.md`,
        name: `Project ${i}`,
        category: 'projects' as const,
        updated_at: `2024-01-${String(i + 1).padStart(2, '0')}T12:00:00Z`,
        status: 'active' as const
      }));
      mockEntryService.list.mockResolvedValue(mockEntries);

      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: {}
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      const listResult = result.data as ListEntriesResult;
      expect(listResult.entries).toHaveLength(10); // Default limit
      expect(listResult.total).toBe(15); // Total before limit
    });

    it('should return empty array when no entries match', async () => {
      mockEntryService.list.mockResolvedValue([]);

      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: { category: 'projects' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      const listResult = result.data as ListEntriesResult;
      expect(listResult.entries).toHaveLength(0);
      expect(listResult.total).toBe(0);
    });

    it('should handle EntryService errors gracefully', async () => {
      mockEntryService.list.mockRejectedValue(new Error('Database error'));

      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: {}
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database error');
    });

    it('should return all entries when limit exceeds total count', async () => {
      const mockEntries: EntrySummary[] = [
        { path: 'projects/project-a.md', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' },
        { path: 'projects/project-b.md', name: 'Project B', category: 'projects', updated_at: '2024-01-02T12:00:00Z', status: 'active' }
      ];
      mockEntryService.list.mockResolvedValue(mockEntries);

      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: { limit: 100 }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      const listResult = result.data as ListEntriesResult;
      expect(listResult.entries).toHaveLength(2);
      expect(listResult.total).toBe(2);
    });
  });

  describe('get_entry handler', () => {
    it('should return full entry data for existing entry', async () => {
      const mockEntry: EntryWithPath = {
        path: 'projects/test-project.md',
        category: 'projects',
        entry: {
          id: 'test-id',
          name: 'Test Project',
          tags: ['important'],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.9,
          status: 'active',
          next_action: 'Review requirements',
          related_people: ['people/john-doe.md']
        },
        content: '# Test Project\n\nThis is the project content.'
      };
      mockEntryService.read.mockResolvedValue(mockEntry);

      const toolCall: ToolCall = {
        name: 'get_entry',
        arguments: { path: 'projects/test-project.md' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const getResult = result.data as GetEntryResult;
      expect(getResult.entry).toEqual(mockEntry);
      expect(getResult.entry.path).toBe('projects/test-project.md');
      expect(getResult.entry.category).toBe('projects');
      expect(getResult.entry.content).toBe('# Test Project\n\nThis is the project content.');
      expect(mockEntryService.read).toHaveBeenCalledWith('projects/test-project.md');
    });

    it('should return error for non-existent entry', async () => {
      mockEntryService.read.mockRejectedValue(new Error('Entry not found: projects/non-existent.md'));

      const toolCall: ToolCall = {
        name: 'get_entry',
        arguments: { path: 'projects/non-existent.md' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Entry not found');
      expect(mockEntryService.read).toHaveBeenCalledWith('projects/non-existent.md');
    });

    it('should handle EntryService errors gracefully', async () => {
      mockEntryService.read.mockRejectedValue(new Error('File system error'));

      const toolCall: ToolCall = {
        name: 'get_entry',
        arguments: { path: 'projects/test.md' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File system error');
    });
  });

  describe('generate_digest handler', () => {
    it('should generate daily digest and return content', async () => {
      const mockDailyDigest = `Good morning.

**Top 3 for Today:**
1. Review project requirements (Test Project)
2. Call John about meeting
3. Submit expense report

---
Reply to this message to capture a thought.`;
      
      mockDigestService.generateDailyDigest = jest.fn().mockResolvedValue(mockDailyDigest);

      const toolCall: ToolCall = {
        name: 'generate_digest',
        arguments: { type: 'daily' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const digestResult = result.data as DigestResult;
      expect(digestResult.type).toBe('daily');
      expect(digestResult.content).toBe(mockDailyDigest);
      expect(mockDigestService.generateDailyDigest).toHaveBeenCalled();
    });

    it('should generate weekly review and return content', async () => {
      const mockWeeklyReview = `# Week of January 1 - January 7, 2024

**What Happened:**
- 15 thoughts captured
- 5 entries created (2 projects, 2 people, 1 ideas)
- 3 tasks completed

**Biggest Open Loops:**
1. ClientCo Integration – waiting
2. Budget Review – blocked

**Suggested Focus for Next Week:**
1. Resolve inbox items
2. Follow up with John Doe

**Theme I Noticed:**
Most activity this week was project-focused (40% of entries).

---
Reply with thoughts or adjustments.`;
      
      mockDigestService.generateWeeklyReview = jest.fn().mockResolvedValue(mockWeeklyReview);

      const toolCall: ToolCall = {
        name: 'generate_digest',
        arguments: { type: 'weekly' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const digestResult = result.data as DigestResult;
      expect(digestResult.type).toBe('weekly');
      expect(digestResult.content).toBe(mockWeeklyReview);
      expect(mockDigestService.generateWeeklyReview).toHaveBeenCalled();
    });

    it('should handle DigestService errors gracefully for daily digest', async () => {
      mockDigestService.generateDailyDigest = jest.fn().mockRejectedValue(new Error('Failed to generate daily digest'));

      const toolCall: ToolCall = {
        name: 'generate_digest',
        arguments: { type: 'daily' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to generate daily digest');
    });

    it('should handle DigestService errors gracefully for weekly review', async () => {
      mockDigestService.generateWeeklyReview = jest.fn().mockRejectedValue(new Error('Failed to generate weekly review'));

      const toolCall: ToolCall = {
        name: 'generate_digest',
        arguments: { type: 'weekly' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to generate weekly review');
    });
  });

  describe('update_entry handler', () => {
    it('should return path and updated fields on success', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'projects/test-project.md',
        category: 'projects',
        entry: {
          id: 'test-id',
          name: 'Test Project',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.9,
          status: 'done',
          next_action: 'Review requirements',
          related_people: []
        },
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'projects/test-project.md', updates: { status: 'done' } }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.path).toBe('projects/test-project.md');
      expect(updateResult.updatedFields).toEqual(['status']);
      expect(mockEntryService.update).toHaveBeenCalledWith('projects/test-project.md', { status: 'done' }, 'api');
    });

    it('should handle EntryNotFoundError gracefully', async () => {
      mockEntryService.update.mockRejectedValue(new Error('Entry not found: projects/non-existent.md'));

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'projects/non-existent.md', updates: { status: 'done' } }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Entry not found');
      expect(mockEntryService.update).toHaveBeenCalledWith('projects/non-existent.md', { status: 'done' }, 'api');
    });

    it('should handle multiple field updates', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'projects/test-project.md',
        category: 'projects',
        entry: {
          id: 'test-id',
          name: 'Test Project',
          tags: ['important'],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.9,
          status: 'done',
          next_action: 'Wrap up',
          related_people: ['people/john-doe.md'],
          due_date: '2024-02-01'
        },
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const updates = {
        status: 'done',
        next_action: 'Wrap up',
        due_date: '2024-02-01'
      };

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'projects/test-project.md', updates }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.path).toBe('projects/test-project.md');
      expect(updateResult.updatedFields).toEqual(['status', 'next_action', 'due_date']);
      expect(mockEntryService.update).toHaveBeenCalledWith('projects/test-project.md', updates, 'api');
    });

    it('should handle EntryService errors gracefully', async () => {
      mockEntryService.update.mockRejectedValue(new Error('File system error'));

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'projects/test.md', updates: { status: 'done' } }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File system error');
    });
  });

  describe('move_entry handler', () => {
    it('should move entry from one category to another', async () => {
      // Mock reading existing entry from projects
      const mockExistingEntry: EntryWithPath = {
        path: 'projects/test-project.md',
        category: 'projects',
        entry: {
          id: 'test-id',
          name: 'Test Project',
          tags: ['important'],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.85,
          status: 'active',
          next_action: 'Review requirements',
          related_people: []
        },
        content: ''
      };
      mockEntryService.read.mockResolvedValue(mockExistingEntry);

      // Mock creating new entry in ideas
      const mockNewEntry: EntryWithPath = {
        path: 'ideas/test-project.md',
        category: 'ideas',
        entry: {
          id: 'new-id',
          name: 'Test Project',
          tags: ['important'],
          created_at: '2024-01-03T12:00:00Z',
          updated_at: '2024-01-03T12:00:00Z',
          source_channel: 'api',
          confidence: 0.85,
          one_liner: '',
          related_projects: []
        },
        content: ''
      };
      mockEntryService.create.mockResolvedValue(mockNewEntry);
      mockEntryService.delete.mockResolvedValue(undefined);

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'projects/test-project.md', targetCategory: 'ideas' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const moveResult = result.data as any;
      expect(moveResult.oldPath).toBe('projects/test-project.md');
      expect(moveResult.newPath).toBe('ideas/test-project.md');
      expect(moveResult.category).toBe('ideas');

      // Verify the correct sequence of operations
      expect(mockEntryService.read).toHaveBeenCalledWith('projects/test-project.md');
      expect(mockEntryService.create).toHaveBeenCalledWith(
        'ideas',
        expect.objectContaining({
          name: 'Test Project',
          tags: ['important'],
          confidence: 0.85,
          source_channel: 'api',
          one_liner: '',
          related_projects: []
        }),
        'api'
      );
      expect(mockEntryService.delete).toHaveBeenCalledWith('projects/test-project.md', 'api');
    });

    it('should move inbox entry to classified category using suggested_name', async () => {
      // Mock reading existing inbox entry
      const mockExistingEntry: EntryWithPath = {
        path: 'inbox/20240101120000-unclear-thought.md',
        category: 'inbox',
        entry: {
          id: 'test-id',
          original_text: 'Some unclear thought about a person',
          suggested_category: 'people',
          suggested_name: 'John Doe',
          confidence: 0.45,
          status: 'needs_review',
          source_channel: 'chat',
          created_at: '2024-01-01T12:00:00Z'
        },
        content: ''
      };
      mockEntryService.read.mockResolvedValue(mockExistingEntry);

      // Mock creating new entry in people
      const mockNewEntry: EntryWithPath = {
        path: 'people/john-doe.md',
        category: 'people',
        entry: {
          id: 'new-id',
          name: 'John Doe',
          tags: [],
          created_at: '2024-01-03T12:00:00Z',
          updated_at: '2024-01-03T12:00:00Z',
          source_channel: 'chat',
          confidence: 0.45,
          context: '',
          follow_ups: [],
          related_projects: [],
          last_touched: '2024-01-03'
        },
        content: ''
      };
      mockEntryService.create.mockResolvedValue(mockNewEntry);
      mockEntryService.delete.mockResolvedValue(undefined);

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'inbox/20240101120000-unclear-thought.md', targetCategory: 'people' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const moveResult = result.data as any;
      expect(moveResult.oldPath).toBe('inbox/20240101120000-unclear-thought.md');
      expect(moveResult.newPath).toBe('people/john-doe.md');
      expect(moveResult.category).toBe('people');

      // Verify inbox entry's suggested_name is used as name
      expect(mockEntryService.create).toHaveBeenCalledWith(
        'people',
        expect.objectContaining({
          name: 'John Doe',
          confidence: 0.45,
          source_channel: 'chat',
          context: '',
          follow_ups: [],
          related_projects: []
        }),
        'api'
      );
    });

    it('should handle non-existent entry error', async () => {
      mockEntryService.read.mockRejectedValue(new Error('Entry not found: projects/non-existent.md'));

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'projects/non-existent.md', targetCategory: 'ideas' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Entry not found');
      expect(mockEntryService.read).toHaveBeenCalledWith('projects/non-existent.md');
      expect(mockEntryService.create).not.toHaveBeenCalled();
      expect(mockEntryService.delete).not.toHaveBeenCalled();
    });

    it('should handle create error and not delete original entry', async () => {
      // Mock reading existing entry
      const mockExistingEntry: EntryWithPath = {
        path: 'projects/test-project.md',
        category: 'projects',
        entry: {
          id: 'test-id',
          name: 'Test Project',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.85,
          status: 'active',
          next_action: '',
          related_people: []
        },
        content: ''
      };
      mockEntryService.read.mockResolvedValue(mockExistingEntry);
      mockEntryService.create.mockRejectedValue(new Error('Failed to create entry'));

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'projects/test-project.md', targetCategory: 'ideas' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create entry');
      // Original entry should NOT be deleted if create fails
      expect(mockEntryService.delete).not.toHaveBeenCalled();
    });

    it('should transform entry to admin category with correct defaults', async () => {
      // Mock reading existing entry from ideas
      const mockExistingEntry: EntryWithPath = {
        path: 'ideas/test-idea.md',
        category: 'ideas',
        entry: {
          id: 'test-id',
          name: 'Test Idea',
          tags: ['urgent'],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.9,
          one_liner: 'A great idea',
          related_projects: []
        },
        content: ''
      };
      mockEntryService.read.mockResolvedValue(mockExistingEntry);

      // Mock creating new entry in admin
      const mockNewEntry: EntryWithPath = {
        path: 'admin/test-idea.md',
        category: 'admin',
        entry: {
          id: 'new-id',
          name: 'Test Idea',
          tags: ['urgent'],
          created_at: '2024-01-03T12:00:00Z',
          updated_at: '2024-01-03T12:00:00Z',
          source_channel: 'api',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };
      mockEntryService.create.mockResolvedValue(mockNewEntry);
      mockEntryService.delete.mockResolvedValue(undefined);

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'ideas/test-idea.md', targetCategory: 'admin' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      // Verify admin-specific defaults are applied
      expect(mockEntryService.create).toHaveBeenCalledWith(
        'admin',
        expect.objectContaining({
          name: 'Test Idea',
          tags: ['urgent'],
          confidence: 0.9,
          source_channel: 'api',
          status: 'pending'
        }),
        'api'
      );
    });
  });

  describe('search_entries handler', () => {
    it('should return matching entries for a search query', async () => {
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [
          { path: 'projects/test-project.md', name: 'Test Project', category: 'projects', matchedField: 'name', snippet: 'Test Project' },
          { path: 'ideas/test-idea.md', name: 'Test Idea', category: 'ideas', matchedField: 'one_liner', snippet: 'A test idea' }
        ],
        total: 2
      });

      const toolCall: ToolCall = {
        name: 'search_entries',
        arguments: { query: 'test' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const searchResult = result.data as any;
      expect(searchResult.entries).toHaveLength(2);
      expect(searchResult.total).toBe(2);
      expect(searchResult.entries[0].path).toBe('projects/test-project.md');
      expect(searchResult.entries[1].path).toBe('ideas/test-idea.md');
      expect(mockSearchService.search).toHaveBeenCalledWith('test', { category: undefined, limit: undefined });
    });

    it('should filter by category when provided', async () => {
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [
          { path: 'ideas/great-idea.md', name: 'Great Idea', category: 'ideas', matchedField: 'one_liner', snippet: 'A great test idea' }
        ],
        total: 1
      });

      const toolCall: ToolCall = {
        name: 'search_entries',
        arguments: { query: 'test', category: 'ideas' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      const searchResult = result.data as any;
      expect(searchResult.entries).toHaveLength(1);
      expect(searchResult.entries[0].category).toBe('ideas');
      expect(mockSearchService.search).toHaveBeenCalledWith('test', { category: 'ideas', limit: undefined });
    });

    it('should apply limit when provided', async () => {
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [
          { path: 'projects/project-a.md', name: 'Project A', category: 'projects', matchedField: 'name', snippet: 'Project A test' },
          { path: 'projects/project-b.md', name: 'Project B', category: 'projects', matchedField: 'content', snippet: '...test content...' }
        ],
        total: 5
      });

      const toolCall: ToolCall = {
        name: 'search_entries',
        arguments: { query: 'test', limit: 2 }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      const searchResult = result.data as any;
      expect(searchResult.entries).toHaveLength(2);
      expect(searchResult.total).toBe(5); // Total before limit
      expect(mockSearchService.search).toHaveBeenCalledWith('test', { category: undefined, limit: 2 });
    });

    it('should return empty results when no entries match', async () => {
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [],
        total: 0
      });

      const toolCall: ToolCall = {
        name: 'search_entries',
        arguments: { query: 'nonexistent' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      const searchResult = result.data as any;
      expect(searchResult.entries).toHaveLength(0);
      expect(searchResult.total).toBe(0);
      expect(mockSearchService.search).toHaveBeenCalledWith('nonexistent', { category: undefined, limit: undefined });
    });

    it('should handle SearchService errors gracefully', async () => {
      mockSearchService.search = jest.fn().mockRejectedValue(new Error('Search service error'));

      const toolCall: ToolCall = {
        name: 'search_entries',
        arguments: { query: 'test' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Search service error');
    });

    it('should pass all options to SearchService', async () => {
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [
          { path: 'people/john-doe.md', name: 'John Doe', category: 'people', matchedField: 'context', snippet: '...test context...' }
        ],
        total: 1
      });

      const toolCall: ToolCall = {
        name: 'search_entries',
        arguments: { query: 'john', category: 'people', limit: 5 }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(mockSearchService.search).toHaveBeenCalledWith('john', { category: 'people', limit: 5 });
    });
  });

  describe('execute() - other tools', () => {
    it('should dispatch to list_entries handler with all filters', async () => {
      const mockEntries: EntrySummary[] = [
        { path: 'projects/project-a.md', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' }
      ];
      mockEntryService.list.mockResolvedValue(mockEntries);

      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: { category: 'projects', status: 'active', limit: 5 }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(mockEntryService.list).toHaveBeenCalledWith('projects', { status: 'active' });
    });

    it('should dispatch to generate_digest handler for daily type', async () => {
      const mockDailyDigest = 'Good morning.\n\n**Top 3 for Today:**\n1. Test task';
      mockDigestService.generateDailyDigest = jest.fn().mockResolvedValue(mockDailyDigest);

      const toolCall: ToolCall = {
        name: 'generate_digest',
        arguments: { type: 'daily' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      const digestResult = result.data as DigestResult;
      expect(digestResult.type).toBe('daily');
      expect(digestResult.content).toBe(mockDailyDigest);
    });

    it('should dispatch to update_entry handler', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'projects/test.md',
        category: 'projects',
        entry: {
          id: 'test-id',
          name: 'Test Project',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.9,
          status: 'done',
          next_action: 'Review requirements',
          related_people: []
        },
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'projects/test.md', updates: { status: 'done' } }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(mockEntryService.update).toHaveBeenCalledWith('projects/test.md', { status: 'done' }, 'api');
    });

    it('should dispatch to move_entry handler', async () => {
      // Mock reading existing entry
      const mockExistingEntry: EntryWithPath = {
        path: 'inbox/20240101120000-test-idea.md',
        category: 'inbox',
        entry: {
          id: 'test-id',
          original_text: 'This is a test idea',
          suggested_category: 'ideas',
          suggested_name: 'Test Idea',
          confidence: 0.5,
          status: 'needs_review',
          source_channel: 'api',
          created_at: '2024-01-01T12:00:00Z'
        },
        content: ''
      };
      mockEntryService.read.mockResolvedValue(mockExistingEntry);

      // Mock creating new entry
      const mockNewEntry: EntryWithPath = {
        path: 'projects/test-idea.md',
        category: 'projects',
        entry: {
          id: 'new-id',
          name: 'Test Idea',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-01T12:00:00Z',
          source_channel: 'api',
          confidence: 0.5,
          status: 'active',
          next_action: '',
          related_people: []
        },
        content: ''
      };
      mockEntryService.create.mockResolvedValue(mockNewEntry);
      mockEntryService.delete.mockResolvedValue(undefined);

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'inbox/20240101120000-test-idea.md', targetCategory: 'projects' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const moveResult = result.data as any;
      expect(moveResult.oldPath).toBe('inbox/20240101120000-test-idea.md');
      expect(moveResult.newPath).toBe('projects/test-idea.md');
      expect(moveResult.category).toBe('projects');
      expect(mockEntryService.read).toHaveBeenCalledWith('inbox/20240101120000-test-idea.md');
      expect(mockEntryService.create).toHaveBeenCalledWith('projects', expect.any(Object), 'api');
      expect(mockEntryService.delete).toHaveBeenCalledWith('inbox/20240101120000-test-idea.md', 'api');
    });

    it('should dispatch to search_entries handler', async () => {
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [
          { path: 'projects/test-project.md', name: 'Test Project', category: 'projects', matchedField: 'name', snippet: 'Test Project' }
        ],
        total: 1
      });

      const toolCall: ToolCall = {
        name: 'search_entries',
        arguments: { query: 'test' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const searchResult = result.data as any;
      expect(searchResult.entries).toHaveLength(1);
      expect(searchResult.total).toBe(1);
      expect(mockSearchService.search).toHaveBeenCalledWith('test', { category: undefined, limit: undefined });
    });

    it('should accept optional arguments for search_entries', async () => {
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [
          { path: 'ideas/great-idea.md', name: 'Great Idea', category: 'ideas', matchedField: 'one_liner', snippet: 'A test idea' }
        ],
        total: 1
      });

      const toolCall: ToolCall = {
        name: 'search_entries',
        arguments: { query: 'test', category: 'ideas', limit: 10 }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(mockSearchService.search).toHaveBeenCalledWith('test', { category: 'ideas', limit: 10 });
    });
  });

  describe('argument validation', () => {
    it('should validate required path for get_entry', async () => {
      const toolCall: ToolCall = {
        name: 'get_entry',
        arguments: {} // Missing required 'path'
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(result.error).toContain('path');
    });

    it('should validate required fields for update_entry', async () => {
      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'test.md' } // Missing required 'updates'
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(result.error).toContain('updates');
    });

    it('should validate required fields for move_entry', async () => {
      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'test.md' } // Missing required 'targetCategory'
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(result.error).toContain('targetCategory');
    });

    it('should validate targetCategory enum for move_entry', async () => {
      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'test.md', targetCategory: 'invalid' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('should validate category enum for list_entries', async () => {
      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: { category: 'invalid_category' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
    });

    it('should validate query is required for search_entries', async () => {
      const toolCall: ToolCall = {
        name: 'search_entries',
        arguments: {} // Missing required 'query'
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(result.error).toContain('query');
    });
  });

  describe('ToolResult structure', () => {
    it('should return success=false with error for validation failures', async () => {
      const toolCall: ToolCall = {
        name: 'classify_and_capture',
        arguments: {}
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      expect(result.data).toBeUndefined();
    });

    it('should return success=false with error for unknown tools', async () => {
      const toolCall: ToolCall = {
        name: 'nonexistent_tool',
        arguments: {}
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result).toHaveProperty('success', false);
      expect(result).toHaveProperty('error');
      expect(result.error).toContain('Unknown tool');
    });
  });
});

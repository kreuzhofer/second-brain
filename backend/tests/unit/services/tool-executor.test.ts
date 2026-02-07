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
  DeleteEntryResult,
  getToolExecutor,
  resetToolExecutor
} from '../../../src/services/tool-executor';
import { ToolRegistry, resetToolRegistry } from '../../../src/services/tool-registry';
import { EntryService } from '../../../src/services/entry.service';
import { ClassificationAgent } from '../../../src/services/classification.service';
import { DigestService } from '../../../src/services/digest.service';
import { SearchService } from '../../../src/services/search.service';
import { IndexService } from '../../../src/services/index.service';
import { ActionExtractionService } from '../../../src/services/action-extraction.service';
import { DuplicateService } from '../../../src/services/duplicate.service';
import { OfflineQueueService } from '../../../src/services/offline-queue.service';
import { IntentAnalysisService } from '../../../src/services/intent-analysis.service';
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
  let mockActionExtractionService: jest.Mocked<ActionExtractionService>;
  let mockDuplicateService: jest.Mocked<DuplicateService>;
  let mockOfflineQueueService: jest.Mocked<OfflineQueueService>;
  let mockIntentAnalysisService: jest.Mocked<IntentAnalysisService>;
  let mockToolGuardrailService: { validateToolCall: jest.Mock };

  beforeEach(() => {
    resetToolExecutor();
    resetToolRegistry();
    
    mockToolRegistry = new ToolRegistry();
    mockEntryService = {
      create: jest.fn(),
      read: jest.fn(),
      update: jest.fn(),
      move: jest.fn(),
      merge: jest.fn(),
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

    mockActionExtractionService = {
      extractActions: jest.fn().mockResolvedValue({ actions: [] })
    } as unknown as jest.Mocked<ActionExtractionService>;

    mockDuplicateService = {
      findDuplicatesForText: jest.fn(),
      findDuplicatesForEntry: jest.fn()
    } as unknown as jest.Mocked<DuplicateService>;

    mockOfflineQueueService = {
      isEnabled: jest.fn().mockReturnValue(false),
      enqueueCapture: jest.fn()
    } as unknown as jest.Mocked<OfflineQueueService>;

    mockIntentAnalysisService = {
      analyzeUpdateIntent: jest.fn()
    } as unknown as jest.Mocked<IntentAnalysisService>;

    mockToolGuardrailService = {
      validateToolCall: jest.fn().mockResolvedValue({ allowed: true, confidence: 1 })
    };
    
    toolExecutor = new ToolExecutor(
      mockToolRegistry,
      mockEntryService,
      mockClassificationAgent,
      mockDigestService,
      mockSearchService,
      mockIndexService,
      mockActionExtractionService,
      mockDuplicateService,
      mockOfflineQueueService,
      undefined,
      mockIntentAnalysisService,
      mockToolGuardrailService as any
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

    it('should block mutating tool calls when guardrail rejects intent', async () => {
      mockToolGuardrailService.validateToolCall.mockResolvedValueOnce({
        allowed: false,
        reason: 'Status change not requested by the user',
        confidence: 0.96
      });

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'admin/pay-editor', updates: { status: 'done' } }
      };

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-guardrail-block',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Update the title to "Pay Chris, my editor for his video edits".',
            createdAt: new Date()
          }
        ]
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool call blocked by guardrail');
      expect(result.error).toContain('Status change not requested');
      expect(mockEntryService.update).not.toHaveBeenCalled();
      expect(mockToolGuardrailService.validateToolCall).toHaveBeenCalledWith({
        toolName: 'update_entry',
        args: { path: 'admin/pay-editor', updates: { status: 'done' } },
        userMessage: expect.stringContaining(
          'Update the title to "Pay Chris, my editor for his video edits".'
        )
      });
    });

    it('should provide compact recent conversation context to the guardrail', async () => {
      mockToolGuardrailService.validateToolCall.mockResolvedValueOnce({
        allowed: false,
        reason: 'Need stronger confirmation',
        confidence: 0.7
      });

      const toolCall: ToolCall = {
        name: 'classify_and_capture',
        arguments: { text: 'Draft the one-pager by Sunday' }
      };

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'I need to start drafting the first version of the retail demo one pagers by Sunday evening',
            createdAt: new Date()
          },
          {
            id: 'msg-2',
            conversationId: 'conv-1',
            role: 'assistant' as const,
            content: 'Would you like me to capture that as a task for you?',
            createdAt: new Date()
          },
          {
            id: 'msg-3',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Yes as an admin task',
            createdAt: new Date()
          }
        ]
      };

      await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(mockToolGuardrailService.validateToolCall).toHaveBeenCalledWith({
        toolName: 'classify_and_capture',
        args: { text: 'Draft the one-pager by Sunday' },
        userMessage: expect.stringContaining('Current user message: Yes as an admin task')
      });
      expect(mockToolGuardrailService.validateToolCall).toHaveBeenCalledWith({
        toolName: 'classify_and_capture',
        args: { text: 'Draft the one-pager by Sunday' },
        userMessage: expect.stringContaining('assistant: Would you like me to capture that as a task for you?')
      });
      expect(mockToolGuardrailService.validateToolCall).toHaveBeenCalledWith({
        toolName: 'classify_and_capture',
        args: { text: 'Draft the one-pager by Sunday' },
        userMessage: expect.stringContaining('user: I need to start drafting the first version of the retail demo one pagers by Sunday evening')
      });
    });

    it('should skip guardrail for read-only tools', async () => {
      const mockEntries: EntrySummary[] = [
        {
          id: 'entry-project-a',
          path: 'projects/project-a',
          name: 'Project A',
          category: 'projects',
          updated_at: '2024-01-01T12:00:00Z',
          status: 'active'
        }
      ];
      mockEntryService.list.mockResolvedValue(mockEntries);

      const toolCall: ToolCall = {
        name: 'list_entries',
        arguments: {}
      };

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-guardrail-skip',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Show my entries.',
            createdAt: new Date()
          }
        ]
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(true);
      expect(mockToolGuardrailService.validateToolCall).not.toHaveBeenCalled();
    });

    it('should fail closed when guardrail check errors for mutating tools', async () => {
      mockToolGuardrailService.validateToolCall.mockRejectedValueOnce(new Error('guardrail timeout'));

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'admin/pay-editor', updates: { status: 'pending' } }
      };

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-guardrail-fail-closed',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Set this task back to pending.',
            createdAt: new Date()
          }
        ]
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool guardrail check failed');
      expect(result.error).toContain('guardrail timeout');
      expect(mockEntryService.update).not.toHaveBeenCalled();
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
        reasoning: 'This is clearly a project',
        bodyContent: ''
      };
      mockClassificationAgent.classify.mockResolvedValue(mockClassificationResult);

      // Mock entry creation
      const mockCreatedEntry: EntryWithPath = {
        path: 'projects/test-project',
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
      expect(captureResult.path).toBe('projects/test-project');
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

      // Verify entry was created in the classified category (not inbox) with bodyContent
      expect(mockEntryService.create).toHaveBeenCalledWith(
        'projects',
        expect.objectContaining({
          name: 'Test Project',
          confidence: 0.85,
          source_channel: 'api'
        }),
        'api',
        '' // bodyContent from classification result
      );
    });

    it('should normalize relative due dates when capturing tasks', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-02-05T12:00:00Z'));

      try {
        const mockClassificationResult: ClassificationResult = {
          category: 'admin',
          confidence: 0.9,
          name: 'Pay invoice',
          slug: 'pay-invoice',
          fields: {
            status: 'pending',
            dueDate: '2023-02-05',
            relatedPeople: []
          },
          relatedEntries: [],
          reasoning: 'This is an admin task',
          bodyContent: ''
        };
        mockClassificationAgent.classify.mockResolvedValue(mockClassificationResult);

        const mockCreatedEntry: EntryWithPath = {
          path: 'admin/pay-invoice',
          category: 'admin',
          entry: {
            id: 'test-id',
            name: 'Pay invoice',
            tags: [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            source_channel: 'api',
            confidence: 0.9,
            status: 'pending',
            due_date: '2026-02-06'
          },
          content: ''
        };
        mockEntryService.create.mockResolvedValue(mockCreatedEntry);

        const toolCall: ToolCall = {
          name: 'classify_and_capture',
          arguments: { text: 'Pay the invoice tomorrow' }
        };

        const result = await toolExecutor.execute(toolCall);

        expect(result.success).toBe(true);
        expect(mockEntryService.create).toHaveBeenCalledWith(
          'admin',
          expect.objectContaining({
            due_date: '2026-02-06'
          }),
          'api',
          ''
        );
      } finally {
        jest.useRealTimers();
      }
    });

    it('should link related people when capturing admin tasks', async () => {
      const mockClassificationResult: ClassificationResult = {
        category: 'admin',
        confidence: 0.9,
        name: 'Call Lina Haidu',
        slug: 'call-lina-haidu',
        fields: {
          status: 'pending',
          relatedPeople: ['Lina Haidu']
        },
        relatedEntries: [],
        reasoning: 'This is an admin task',
        bodyContent: ''
      };
      mockClassificationAgent.classify.mockResolvedValue(mockClassificationResult);

      const mockCreatedEntry: EntryWithPath = {
        path: 'admin/call-lina-haidu',
        category: 'admin',
        entry: {
          id: 'test-id',
          name: 'Call Lina Haidu',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_channel: 'api',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };
      mockEntryService.create.mockResolvedValue(mockCreatedEntry);

      const mockEntryLinkService = {
        linkPeopleForEntry: jest.fn().mockResolvedValue(undefined)
      } as any;
      const mockIntentService = {
        analyzeUpdateIntent: jest.fn().mockResolvedValue({
          title: 'Pay Chris, my editor for his video edits',
          note: undefined,
          relatedPeople: ['Chris'],
          statusChangeRequested: false,
          confidence: 0.91
        })
      } as any;

      toolExecutor = new ToolExecutor(
        mockToolRegistry,
        mockEntryService,
        mockClassificationAgent,
        mockDigestService,
        mockSearchService,
        mockIndexService,
        mockActionExtractionService,
        mockDuplicateService,
        mockOfflineQueueService,
        mockEntryLinkService,
        mockIntentService
      );

      const toolCall: ToolCall = {
        name: 'classify_and_capture',
        arguments: { text: 'Call Lina Haidu' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(mockEntryLinkService.linkPeopleForEntry).toHaveBeenCalledWith(
        mockCreatedEntry,
        ['Lina Haidu'],
        'api'
      );
    });

    it('should link related people when updating admin tasks', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'admin/call-lina-haidu',
        category: 'admin',
        entry: {
          id: 'updated-id',
          name: 'Call Lina Haidu',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_channel: 'api',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const mockEntryLinkService = {
        linkPeopleForEntry: jest.fn().mockResolvedValue(undefined)
      } as any;
      const mockIntentService = {
        analyzeUpdateIntent: jest.fn().mockResolvedValue({
          title: 'Pay Chris, my editor for his video edits',
          note: undefined,
          relatedPeople: ['Chris'],
          statusChangeRequested: false,
          confidence: 0.91
        })
      } as any;

      toolExecutor = new ToolExecutor(
        mockToolRegistry,
        mockEntryService,
        mockClassificationAgent,
        mockDigestService,
        mockSearchService,
        mockIndexService,
        mockActionExtractionService,
        mockDuplicateService,
        mockOfflineQueueService,
        mockEntryLinkService,
        mockIntentService
      );

      const updates = { related_people: ['Lina Haidu'] };
      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: mockUpdatedEntry.path, updates }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(mockEntryService.update).toHaveBeenCalledWith(
        mockUpdatedEntry.path,
        updates,
        'api',
        undefined
      );
      expect(mockEntryLinkService.linkPeopleForEntry).toHaveBeenCalledWith(
        mockUpdatedEntry,
        ['Lina Haidu'],
        'api'
      );
    });

    it('should link related people when updating project entries from intent analysis', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'projects/aws-goals-2026',
        category: 'projects',
        entry: {
          id: 'updated-id-project-link',
          name: '2026 Goals for AWS',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_channel: 'api',
          confidence: 0.9,
          status: 'active',
          next_action: 'Draft weekly plan'
        } as any,
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const mockEntryLinkService = {
        linkPeopleForEntry: jest.fn().mockResolvedValue(undefined)
      } as any;
      const mockIntentService = {
        analyzeUpdateIntent: jest.fn().mockResolvedValue({
          title: undefined,
          note: 'Schedule a call with Chris',
          relatedPeople: ['Chris'],
          statusChangeRequested: false,
          confidence: 0.92
        })
      } as any;

      toolExecutor = new ToolExecutor(
        mockToolRegistry,
        mockEntryService,
        mockClassificationAgent,
        mockDigestService,
        mockSearchService,
        mockIndexService,
        mockActionExtractionService,
        mockDuplicateService,
        mockOfflineQueueService,
        mockEntryLinkService,
        mockIntentService
      );

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: {
          path: mockUpdatedEntry.path,
          updates: {}
        }
      };

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-project-link',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Add a note to include Chris in this project.',
            createdAt: new Date()
          }
        ]
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(true);
      expect(mockEntryLinkService.linkPeopleForEntry).toHaveBeenCalledWith(
        mockUpdatedEntry,
        ['Chris'],
        'chat'
      );
    });

    it('should infer related people from the user message when updating admin tasks', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'admin/call-lina-haidu',
        category: 'admin',
        entry: {
          id: 'updated-id-2',
          name: 'Call Lina Haidu',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_channel: 'api',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const mockEntryLinkService = {
        linkPeopleForEntry: jest.fn().mockResolvedValue(undefined)
      } as any;

      toolExecutor = new ToolExecutor(
        mockToolRegistry,
        mockEntryService,
        mockClassificationAgent,
        mockDigestService,
        mockSearchService,
        mockIndexService,
        mockActionExtractionService,
        mockDuplicateService,
        mockOfflineQueueService,
        mockEntryLinkService
      );

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: {
          path: mockUpdatedEntry.path,
          updates: {},
          body_content: { content: 'Add a note about the contract.', mode: 'append' }
        }
      };

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-1',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Add a note to the Call Lina Haidu task about the contract.',
            createdAt: new Date()
          }
        ]
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(true);
      expect(mockEntryLinkService.linkPeopleForEntry).toHaveBeenCalledWith(
        mockUpdatedEntry,
        ['Lina Haidu'],
        'chat'
      );
    });

    it('should infer title and note when updating admin tasks from user message', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'admin/pay-the-editor',
        category: 'admin',
        entry: {
          id: 'updated-id-4',
          name: 'Pay the editor',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_channel: 'api',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const mockEntryLinkService = {
        linkPeopleForEntry: jest.fn().mockResolvedValue(undefined)
      } as any;
      const mockIntentService = {
        analyzeUpdateIntent: jest.fn().mockResolvedValue({
          title: 'Pay Chris, my editor for his video edits',
          note: 'I should write him an email with apologies for delays',
          relatedPeople: ['Chris'],
          statusChangeRequested: false,
          confidence: 0.9
        })
      } as any;

      toolExecutor = new ToolExecutor(
        mockToolRegistry,
        mockEntryService,
        mockClassificationAgent,
        mockDigestService,
        mockSearchService,
        mockIndexService,
        mockActionExtractionService,
        mockDuplicateService,
        mockOfflineQueueService,
        mockEntryLinkService,
        mockIntentService
      );

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: mockUpdatedEntry.path, updates: {} }
      };

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-3',
            conversationId: 'conv-1',
            role: 'user' as const,
            content:
              'Update the entry to "Pay Chris, my editor for his video edits". Add a note that I should write him an email with apologies for delays.',
            createdAt: new Date()
          }
        ]
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(true);
      expect(mockEntryService.update).toHaveBeenCalledWith(
        mockUpdatedEntry.path,
        { name: 'Pay Chris, my editor for his video edits' },
        'chat',
        { content: 'I should write him an email with apologies for delays', mode: 'append' }
      );
      expect(mockEntryLinkService.linkPeopleForEntry).toHaveBeenCalledWith(
        mockUpdatedEntry,
        ['Chris'],
        'chat'
      );
      expect(mockIntentService.analyzeUpdateIntent).toHaveBeenCalled();
    });

    it('should emit warning and use heuristic fallback when intent analysis fails', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'admin/pay-the-editor',
        category: 'admin',
        entry: {
          id: 'updated-id-intent-fallback',
          name: 'Pay the editor',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_channel: 'api',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const mockEntryLinkService = {
        linkPeopleForEntry: jest.fn().mockResolvedValue(undefined)
      } as any;
      const mockIntentService = {
        analyzeUpdateIntent: jest.fn().mockRejectedValue(new Error('model timeout'))
      } as any;

      toolExecutor = new ToolExecutor(
        mockToolRegistry,
        mockEntryService,
        mockClassificationAgent,
        mockDigestService,
        mockSearchService,
        mockIndexService,
        mockActionExtractionService,
        mockDuplicateService,
        mockOfflineQueueService,
        mockEntryLinkService,
        mockIntentService
      );

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: mockUpdatedEntry.path, updates: {} }
      };

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-intent-fallback',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Update the entry title to "Pay Chris, my editor for his video edits".',
            createdAt: new Date()
          }
        ]
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(true);
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.warnings?.some((w) => w.includes('Intent analysis unavailable'))).toBe(true);
      expect(mockEntryService.update).toHaveBeenCalledWith(
        mockUpdatedEntry.path,
        { name: 'Pay Chris, my editor for his video edits' },
        'chat',
        undefined
      );
    });

    it('should ignore implicit status updates when not requested', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'admin/pay-the-editor',
        category: 'admin',
        entry: {
          id: 'updated-id-5',
          name: 'Pay the editor',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_channel: 'api',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const mockEntryLinkService = {
        linkPeopleForEntry: jest.fn().mockResolvedValue(undefined)
      } as any;
      const mockIntentService = {
        analyzeUpdateIntent: jest.fn().mockResolvedValue({
          title: 'Pay Chris, my editor for his video edits',
          note: undefined,
          relatedPeople: ['Chris'],
          statusChangeRequested: false,
          confidence: 0.91
        })
      } as any;

      toolExecutor = new ToolExecutor(
        mockToolRegistry,
        mockEntryService,
        mockClassificationAgent,
        mockDigestService,
        mockSearchService,
        mockIndexService,
        mockActionExtractionService,
        mockDuplicateService,
        mockOfflineQueueService,
        mockEntryLinkService,
        mockIntentService
      );

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: mockUpdatedEntry.path, updates: { status: 'done' } }
      };

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-4',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Update the entry title to "Pay Chris, my editor for his video edits".',
            createdAt: new Date()
          }
        ]
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(true);
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.warnings).toBeDefined();
      expect(updateResult.warnings?.[0]).toContain('status');
      expect(mockEntryService.update).toHaveBeenCalledWith(
        mockUpdatedEntry.path,
        { name: 'Pay Chris, my editor for his video edits' },
        'chat',
        undefined
      );
      expect(mockEntryLinkService.linkPeopleForEntry).toHaveBeenCalledWith(
        mockUpdatedEntry,
        ['Chris'],
        'chat'
      );
    });

    it('should ignore non-name phrases and still capture real names in update messages', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'admin/pay-the-editor',
        category: 'admin',
        entry: {
          id: 'updated-id-3',
          name: 'Pay the editor',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_channel: 'api',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const mockEntryLinkService = {
        linkPeopleForEntry: jest.fn().mockResolvedValue(undefined)
      } as any;

      toolExecutor = new ToolExecutor(
        mockToolRegistry,
        mockEntryService,
        mockClassificationAgent,
        mockDigestService,
        mockSearchService,
        mockIndexService,
        mockActionExtractionService,
        mockDuplicateService,
        mockOfflineQueueService,
        mockEntryLinkService
      );

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: {
          path: mockUpdatedEntry.path,
          updates: {},
          body_content: { content: 'Write an email with apologies for delays.', mode: 'append' }
        }
      };

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-2',
            conversationId: 'conv-1',
            role: 'user' as const,
            content:
              'Update the entry to pay the editor to "Pay Chris, my editor for his video edits". Add a note that I should write him an email with apologies for delays.',
            createdAt: new Date()
          }
        ]
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(true);
      expect(mockEntryLinkService.linkPeopleForEntry).toHaveBeenCalledWith(
        mockUpdatedEntry,
        ['Chris'],
        'chat'
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
        reasoning: 'Not sure what this is',
        bodyContent: ''
      };
      mockClassificationAgent.classify.mockResolvedValue(mockClassificationResult);

      // Mock inbox entry creation
      const mockCreatedEntry: EntryWithPath = {
        path: 'inbox/20240101120000-unclear-thought',
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
        'api',
        expect.stringContaining('Agent Note')
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
        reasoning: 'Hint indicated person',
        bodyContent: ''
      };
      mockClassificationAgent.classify.mockResolvedValue(mockClassificationResult);

      const mockCreatedEntry: EntryWithPath = {
        path: 'people/john-doe',
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

    // Integration test for classify_and_capture with body content (Task 6.2)
    // Requirements: 1.1, 1.6
    it('should pass body content from ClassificationAgent to EntryService.create()', async () => {
      // Mock classification result with non-empty body content
      const mockBodyContent = `## Notes

- Met at the tech conference in Seattle
- Works on AI/ML projects
- Interested in collaboration opportunities`;

      const mockClassificationResult: ClassificationResult = {
        category: 'people',
        confidence: 0.92,
        name: 'Sarah Chen',
        slug: 'sarah-chen',
        fields: {
          context: 'Met at tech conference',
          followUps: ['Schedule follow-up call'],
          relatedProjects: []
        },
        relatedEntries: [],
        reasoning: 'Input describes meeting a person with professional context',
        bodyContent: mockBodyContent
      };
      mockClassificationAgent.classify.mockResolvedValue(mockClassificationResult);

      // Mock entry creation with body content
      const mockCreatedEntry: EntryWithPath = {
        path: 'people/sarah-chen',
        category: 'people',
        entry: {
          id: 'test-id',
          name: 'Sarah Chen',
          tags: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          source_channel: 'api',
          confidence: 0.92,
          context: 'Met at tech conference',
          follow_ups: ['Schedule follow-up call'],
          related_projects: [],
          last_touched: new Date().toISOString().split('T')[0]
        },
        content: mockBodyContent
      };
      mockEntryService.create.mockResolvedValue(mockCreatedEntry);

      const toolCall: ToolCall = {
        name: 'classify_and_capture',
        arguments: { text: 'Met Sarah Chen at the tech conference in Seattle. She works on AI/ML projects and is interested in collaboration.' }
      };

      const result = await toolExecutor.execute(toolCall);

      // Verify successful capture
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const captureResult = result.data as CaptureResult;
      expect(captureResult.path).toBe('people/sarah-chen');
      expect(captureResult.category).toBe('people');
      expect(captureResult.name).toBe('Sarah Chen');

      // Verify body content was passed to EntryService.create()
      expect(mockEntryService.create).toHaveBeenCalledWith(
        'people',
        expect.objectContaining({
          name: 'Sarah Chen',
          confidence: 0.92,
          source_channel: 'api'
        }),
        'api',
        mockBodyContent // Verify body content is passed as 4th argument
      );
    });
  });

  describe('list_entries handler', () => {
    it('should return all entries when no filters provided', async () => {
      const mockEntries: EntrySummary[] = [
        { id: 'entry-project-a', path: 'projects/project-a', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' },
        { id: 'entry-john-doe', path: 'people/john-doe', name: 'John Doe', category: 'people', updated_at: '2024-01-02T12:00:00Z' },
        { id: 'entry-new-idea', path: 'ideas/new-idea', name: 'New Idea', category: 'ideas', updated_at: '2024-01-03T12:00:00Z', one_liner: 'A great idea' }
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
        { id: 'entry-project-a', path: 'projects/project-a', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' },
        { id: 'entry-project-b', path: 'projects/project-b', name: 'Project B', category: 'projects', updated_at: '2024-01-02T12:00:00Z', status: 'waiting' }
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
        { id: 'entry-project-a', path: 'projects/project-a', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' }
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
        { id: 'entry-project-a', path: 'projects/project-a', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' }
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
        { id: 'entry-project-a', path: 'projects/project-a', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' },
        { id: 'entry-project-b', path: 'projects/project-b', name: 'Project B', category: 'projects', updated_at: '2024-01-02T12:00:00Z', status: 'active' },
        { id: 'entry-project-c', path: 'projects/project-c', name: 'Project C', category: 'projects', updated_at: '2024-01-03T12:00:00Z', status: 'active' },
        { id: 'entry-project-d', path: 'projects/project-d', name: 'Project D', category: 'projects', updated_at: '2024-01-04T12:00:00Z', status: 'active' },
        { id: 'entry-project-e', path: 'projects/project-e', name: 'Project E', category: 'projects', updated_at: '2024-01-05T12:00:00Z', status: 'active' }
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
        id: `entry-${i}`,
        path: `projects/project-${i}`,
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
        { id: 'entry-project-a', path: 'projects/project-a', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' },
        { id: 'entry-project-b', path: 'projects/project-b', name: 'Project B', category: 'projects', updated_at: '2024-01-02T12:00:00Z', status: 'active' }
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
        path: 'projects/test-project',
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
          related_people: ['people/john-doe']
        },
        content: '# Test Project\n\nThis is the project content.'
      };
      mockEntryService.read.mockResolvedValue(mockEntry);

      const toolCall: ToolCall = {
        name: 'get_entry',
        arguments: { path: 'projects/test-project' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const getResult = result.data as GetEntryResult;
      expect(getResult.entry).toEqual(mockEntry);
      expect(getResult.entry.path).toBe('projects/test-project');
      expect(getResult.entry.category).toBe('projects');
      expect(getResult.entry.content).toBe('# Test Project\n\nThis is the project content.');
      expect(mockEntryService.read).toHaveBeenCalledWith('projects/test-project');
    });

    it('should return error for non-existent entry', async () => {
      mockEntryService.read.mockRejectedValue(new Error('Entry not found: projects/non-existent'));

      const toolCall: ToolCall = {
        name: 'get_entry',
        arguments: { path: 'projects/non-existent' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Entry not found');
      expect(mockEntryService.read).toHaveBeenCalledWith('projects/non-existent');
    });

    it('should handle EntryService errors gracefully', async () => {
      mockEntryService.read.mockRejectedValue(new Error('File system error'));

      const toolCall: ToolCall = {
        name: 'get_entry',
        arguments: { path: 'projects/test' }
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
    it('should reopen a completed task fallback when requested path is missing', async () => {
      const reopenedEntry: EntryWithPath = {
        path: 'admin/finish-q4-2025-tax-report',
        category: 'admin',
        entry: {
          id: 'done-entry-id',
          name: 'Finish Q4 2025 Tax Report',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'chat',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };
      mockEntryService.update
        .mockRejectedValueOnce(new Error('Entry not found: admin/finish-q4-2025-tax-report'))
        .mockResolvedValueOnce(reopenedEntry);
      mockEntryService.list.mockResolvedValue([
        {
          id: 'done-summary-id',
          path: 'admin/finish-q4-2025-tax-report',
          name: 'Finish Q4 2025 Tax Report',
          category: 'admin',
          updated_at: '2024-01-03T12:00:00Z',
          status: 'done'
        }
      ] as EntrySummary[]);

      const mockIntentService = {
        analyzeUpdateIntent: jest.fn().mockResolvedValue({
          relatedPeople: [],
          statusChangeRequested: true,
          requestedStatus: 'pending',
          confidence: 0.95
        })
      } as any;

      toolExecutor = new ToolExecutor(
        mockToolRegistry,
        mockEntryService,
        mockClassificationAgent,
        mockDigestService,
        mockSearchService,
        mockIndexService,
        mockActionExtractionService,
        mockDuplicateService,
        mockOfflineQueueService,
        undefined,
        mockIntentService
      );

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-reopen-fallback',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Please reopen Finish Q4 2025 Tax Report and set it back to pending.',
            createdAt: new Date()
          }
        ]
      };

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'admin/finish-q4-2025-tax-report', updates: { status: 'pending' } }
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(true);
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.path).toBe('admin/finish-q4-2025-tax-report');
      expect(updateResult.warnings?.some((warning) => warning.includes('completed task'))).toBe(true);
      expect(mockEntryService.list).toHaveBeenCalledWith('admin', { status: 'done' });
      expect(mockEntryService.update).toHaveBeenNthCalledWith(
        1,
        'admin/finish-q4-2025-tax-report',
        { status: 'pending' },
        'chat',
        undefined
      );
      expect(mockEntryService.update).toHaveBeenNthCalledWith(
        2,
        'admin/finish-q4-2025-tax-report',
        { status: 'pending' },
        'chat',
        undefined
      );
    });

    it('should fail with disambiguation error when reopen fallback matches multiple completed tasks', async () => {
      mockEntryService.update.mockRejectedValue(new Error('Entry not found: admin/finish-q4-2025-tax-report'));
      mockEntryService.list.mockResolvedValue([
        {
          id: 'done-summary-id-1',
          path: 'admin/finish-q4-2025-tax-report',
          name: 'Finish Q4 2025 Tax Report',
          category: 'admin',
          updated_at: '2024-01-03T12:00:00Z',
          status: 'done'
        },
        {
          id: 'done-summary-id-2',
          path: 'admin/finish-q4-2025-tax-review',
          name: 'Finish Q4 2025 Tax Review',
          category: 'admin',
          updated_at: '2024-01-04T12:00:00Z',
          status: 'done'
        }
      ] as EntrySummary[]);

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-reopen-ambiguous',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Reopen the Q4 tax task.',
            createdAt: new Date()
          }
        ]
      };

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'admin/finish-q4-2025-tax-report', updates: { status: 'pending' } }
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Multiple completed tasks match');
      expect(mockEntryService.list).toHaveBeenCalledWith('admin', { status: 'done' });
      expect(mockEntryService.update).toHaveBeenCalledTimes(1);
    });

    it('should align status update with explicit user intent when tool args disagree', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'admin/pay-the-editor',
        category: 'admin',
        entry: {
          id: 'test-id-status-align',
          name: 'Pay the editor',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'chat',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const mockIntentService = {
        analyzeUpdateIntent: jest.fn().mockResolvedValue({
          relatedPeople: [],
          statusChangeRequested: true,
          requestedStatus: 'pending',
          confidence: 0.93
        })
      } as any;

      toolExecutor = new ToolExecutor(
        mockToolRegistry,
        mockEntryService,
        mockClassificationAgent,
        mockDigestService,
        mockSearchService,
        mockIndexService,
        mockActionExtractionService,
        mockDuplicateService,
        mockOfflineQueueService,
        undefined,
        mockIntentService
      );

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-status-align',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Set this task back to pending.',
            createdAt: new Date()
          }
        ]
      };

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'admin/pay-the-editor', updates: { status: 'done' } }
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(true);
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.warnings?.some((warning) => warning.toLowerCase().includes('status'))).toBe(true);
      expect(mockEntryService.update).toHaveBeenCalledWith(
        'admin/pay-the-editor',
        { status: 'pending' },
        'chat',
        undefined
      );
    });

    it('should return path and updated fields on success', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'projects/test-project',
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
        arguments: { path: 'projects/test-project', updates: { status: 'done' } }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.path).toBe('projects/test-project');
      expect(updateResult.updatedFields).toEqual(['status']);
      expect(mockEntryService.update).toHaveBeenCalledWith('projects/test-project', { status: 'done' }, 'api', undefined);
    });

    it('should resolve update path by searching when requested path does not exist', async () => {
      const resolvedPath = 'admin/api-smoke-alpha-task';
      const updatedEntry: EntryWithPath = {
        path: resolvedPath,
        category: 'admin',
        entry: {
          id: 'test-id-resolved-update',
          name: 'Api smoke alpha docs',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'chat',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };

      mockEntryService.read
        .mockRejectedValueOnce(new Error('Entry not found: admin/api-smoke-alpha-docs'));
      mockEntryService.update.mockResolvedValue(updatedEntry);
      mockEntryService.list.mockResolvedValue([] as EntrySummary[]);
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [
          {
            path: resolvedPath,
            name: 'Api smoke alpha task',
            category: 'admin',
            matchedField: 'name',
            snippet: 'Api smoke alpha task'
          }
        ],
        total: 1
      });

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-update-resolve',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Update "Api smoke alpha task" title to "Api smoke alpha docs".',
            createdAt: new Date()
          }
        ]
      };

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: {
          path: 'admin/api-smoke-alpha-docs',
          updates: { name: 'Api smoke alpha docs' }
        }
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(true);
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.path).toBe(resolvedPath);
      expect(updateResult.warnings?.some((warning) => warning.includes('Used matching entry'))).toBe(true);
      expect(mockEntryService.update).toHaveBeenCalledTimes(1);
      expect(mockEntryService.update).toHaveBeenCalledWith(
        resolvedPath,
        { name: 'Api smoke alpha docs' },
        'chat',
        undefined
      );
      expect((updateResult as any).receipt).toMatchObject({
        operation: 'update',
        requestedPath: 'admin/api-smoke-alpha-docs',
        resolvedPath
      });
      expect((updateResult as any).receipt.verification.verified).toBe(true);
      expect((updateResult as any).receipt.verification.checks.length).toBeGreaterThan(0);
    });

    it('should include mutation receipt on successful update', async () => {
      const updatedEntry: EntryWithPath = {
        path: 'projects/test-project',
        category: 'projects',
        entry: {
          id: 'entry-update-receipt',
          name: 'Test Project',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.9,
          status: 'done',
          next_action: 'Wrap up',
          related_people: []
        },
        content: 'done'
      };
      mockEntryService.update.mockResolvedValue(updatedEntry);

      const result = await toolExecutor.execute({
        name: 'update_entry',
        arguments: { path: 'projects/test-project', updates: { status: 'done' } }
      });

      expect(result.success).toBe(true);
      const updateResult = result.data as UpdateEntryResult;
      expect((updateResult as any).receipt).toMatchObject({
        operation: 'update',
        requestedPath: 'projects/test-project',
        resolvedPath: 'projects/test-project'
      });
      expect((updateResult as any).receipt.verification.verified).toBe(true);
    });

    it('should fail update when post-mutation verification does not match requested status', async () => {
      const mismatchedEntry: EntryWithPath = {
        path: 'admin/pay-editor',
        category: 'admin',
        entry: {
          id: 'entry-status-mismatch',
          name: 'Pay editor',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'chat',
          confidence: 0.9,
          status: 'done'
        },
        content: ''
      };
      mockEntryService.update.mockResolvedValue(mismatchedEntry);

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: {
          path: 'admin/pay-editor',
          updates: { status: 'pending' }
        }
      };

      const result = await toolExecutor.execute(toolCall, {
        channel: 'chat',
        context: {
          systemPrompt: 'Test',
          indexContent: '',
          summaries: [],
          recentMessages: [
            {
              id: 'msg-status-verify',
              conversationId: 'conv-1',
              role: 'user' as const,
              content: 'Set this back to pending',
              createdAt: new Date()
            }
          ]
        }
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Mutation verification failed');
    });

    it('should handle EntryNotFoundError gracefully', async () => {
      mockEntryService.update.mockRejectedValue(new Error('Entry not found: projects/non-existent'));

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'projects/non-existent', updates: { status: 'done' } }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Entry not found');
      expect(mockEntryService.update).toHaveBeenCalledWith('projects/non-existent', { status: 'done' }, 'api', undefined);
    });

    it('should handle multiple field updates', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'projects/test-project',
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
          related_people: ['people/john-doe'],
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
        arguments: { path: 'projects/test-project', updates }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.path).toBe('projects/test-project');
      expect(updateResult.updatedFields).toEqual(['status', 'next_action', 'due_date']);
      expect(mockEntryService.update).toHaveBeenCalledWith('projects/test-project', updates, 'api', undefined);
    });

    it('should handle EntryService errors gracefully', async () => {
      mockEntryService.update.mockRejectedValue(new Error('File system error'));

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: { path: 'projects/test', updates: { status: 'done' } }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('File system error');
    });

    // Unit tests for update_entry body content (Task 5.3)
    // Requirements: 2.1, 2.2, 2.3, 2.4

    it('should pass body_content with append mode to EntryService', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'projects/test-project',
        category: 'projects',
        entry: {
          id: 'test-id',
          name: 'Test Project',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.9,
          status: 'active',
          next_action: 'Review requirements',
          related_people: []
        },
        content: 'Existing content\n\nNew appended content'
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: {
          path: 'projects/test-project',
          body_content: {
            content: 'New appended content',
            mode: 'append'
          }
        }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.path).toBe('projects/test-project');
      expect(updateResult.bodyUpdated).toBe(true);
      expect(updateResult.bodyMode).toBe('append');
      expect(mockEntryService.update).toHaveBeenCalledWith(
        'projects/test-project',
        {},
        'api',
        { content: 'New appended content', mode: 'append', section: undefined }
      );
    });

    it('should pass body_content with replace mode to EntryService', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'ideas/test-idea',
        category: 'ideas',
        entry: {
          id: 'test-id',
          name: 'Test Idea',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.85,
          one_liner: 'A great idea',
          related_projects: []
        },
        content: 'Completely new content'
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: {
          path: 'ideas/test-idea',
          body_content: {
            content: 'Completely new content',
            mode: 'replace'
          }
        }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.path).toBe('ideas/test-idea');
      expect(updateResult.bodyUpdated).toBe(true);
      expect(updateResult.bodyMode).toBe('replace');
      expect(mockEntryService.update).toHaveBeenCalledWith(
        'ideas/test-idea',
        {},
        'api',
        { content: 'Completely new content', mode: 'replace', section: undefined }
      );
    });

    it('should pass body_content with section mode to EntryService', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'people/john-doe',
        category: 'people',
        entry: {
          id: 'test-id',
          name: 'John Doe',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.9,
          context: 'Met at conference',
          follow_ups: [],
          related_projects: [],
          last_touched: '2024-01-02'
        },
        content: '## Notes\n\nExisting notes\n\nNew note about John'
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: {
          path: 'people/john-doe',
          body_content: {
            content: 'New note about John',
            mode: 'section',
            section: 'Notes'
          }
        }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.path).toBe('people/john-doe');
      expect(updateResult.bodyUpdated).toBe(true);
      expect(updateResult.bodyMode).toBe('section');
      expect(mockEntryService.update).toHaveBeenCalledWith(
        'people/john-doe',
        {},
        'api',
        { content: 'New note about John', mode: 'section', section: 'Notes' }
      );
    });

    it('should return error when section mode is used without section name', async () => {
      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: {
          path: 'projects/test-project',
          body_content: {
            content: 'Some content',
            mode: 'section'
            // Missing section name
          }
        }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Section name required for section mode');
      expect(mockEntryService.update).not.toHaveBeenCalled();
    });

    it('should return error for invalid body_content mode', async () => {
      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: {
          path: 'projects/test-project',
          body_content: {
            content: 'Some content',
            mode: 'invalid_mode'
          }
        }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      // Schema validation catches invalid mode before handler code
      expect(result.error).toContain('body_content.mode');
      expect(result.error).toContain('append, replace, section');
      expect(mockEntryService.update).not.toHaveBeenCalled();
    });

    it('should allow combining frontmatter updates with body_content updates', async () => {
      const mockUpdatedEntry: EntryWithPath = {
        path: 'projects/test-project',
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
          next_action: 'Wrap up',
          related_people: []
        },
        content: '## Log\n\n- 2024-01-02: Project completed'
      };
      mockEntryService.update.mockResolvedValue(mockUpdatedEntry);

      const toolCall: ToolCall = {
        name: 'update_entry',
        arguments: {
          path: 'projects/test-project',
          updates: { status: 'done' },
          body_content: {
            content: 'Project completed',
            mode: 'section',
            section: 'Log'
          }
        }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const updateResult = result.data as UpdateEntryResult;
      expect(updateResult.path).toBe('projects/test-project');
      expect(updateResult.updatedFields).toEqual(['status']);
      expect(updateResult.bodyUpdated).toBe(true);
      expect(updateResult.bodyMode).toBe('section');
      expect(mockEntryService.update).toHaveBeenCalledWith(
        'projects/test-project',
        { status: 'done' },
        'api',
        { content: 'Project completed', mode: 'section', section: 'Log' }
      );
    });
  });

  describe('delete_entry handler', () => {
    it('should return path and name on successful deletion', async () => {
      // Mock reading existing entry to get name
      const mockExistingEntry: EntryWithPath = {
        path: 'admin/grocery-shopping',
        category: 'admin',
        entry: {
          id: 'test-id',
          name: 'Grocery Shopping',
          tags: [],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
          source_channel: 'api',
          confidence: 0.9,
          status: 'pending'
        },
        content: ''
      };
      mockEntryService.read
        .mockResolvedValueOnce(mockExistingEntry)
        .mockRejectedValueOnce(new Error('Entry not found: admin/grocery-shopping'));
      mockEntryService.delete.mockResolvedValue(undefined);

      const toolCall: ToolCall = {
        name: 'delete_entry',
        arguments: { path: 'admin/grocery-shopping' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const deleteResult = result.data as DeleteEntryResult;
      expect(deleteResult.path).toBe('admin/grocery-shopping');
      expect(deleteResult.name).toBe('Grocery Shopping');
      expect(deleteResult.category).toBe('admin');
      expect(mockEntryService.read).toHaveBeenCalledWith('admin/grocery-shopping');
      expect(mockEntryService.delete).toHaveBeenCalledWith('admin/grocery-shopping', 'api');
      expect((deleteResult as any).receipt).toMatchObject({
        operation: 'delete',
        requestedPath: 'admin/grocery-shopping',
        resolvedPath: 'admin/grocery-shopping'
      });
      expect((deleteResult as any).receipt.verification.verified).toBe(true);
    });

    it('should return error for non-existent entry', async () => {
      mockEntryService.read.mockRejectedValue(new Error('Entry not found: projects/non-existent'));

      const toolCall: ToolCall = {
        name: 'delete_entry',
        arguments: { path: 'projects/non-existent' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Entry not found');
      expect(mockEntryService.read).toHaveBeenCalledWith('projects/non-existent');
      expect(mockEntryService.delete).not.toHaveBeenCalled();
    });

    it('should resolve delete path by searching when requested path does not exist', async () => {
      mockEntryService.read
        .mockRejectedValueOnce(new Error('Entry not found: admin/api-smoke-delete-target'))
        .mockResolvedValueOnce({
          path: 'admin/api-smoke-alpha-task',
          category: 'admin',
          entry: {
            id: 'entry-delete-resolved',
            name: 'Api smoke alpha task',
            tags: [],
            created_at: '2024-01-01T12:00:00Z',
            updated_at: '2024-01-02T12:00:00Z',
            source_channel: 'chat',
            confidence: 0.9,
            status: 'pending'
          },
          content: ''
        } as EntryWithPath);
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [
          {
            path: 'admin/api-smoke-alpha-task',
            name: 'Api smoke alpha task',
            category: 'admin',
            matchedField: 'name',
            snippet: 'Api smoke alpha task'
          }
        ],
        total: 1
      });
      mockEntryService.delete.mockResolvedValue(undefined);

      const context = {
        systemPrompt: 'Test system prompt',
        indexContent: '# Index\n\nTest index content',
        summaries: [],
        recentMessages: [
          {
            id: 'msg-delete-resolve',
            conversationId: 'conv-1',
            role: 'user' as const,
            content: 'Delete "Api smoke alpha task".',
            createdAt: new Date()
          }
        ]
      };

      const toolCall: ToolCall = {
        name: 'delete_entry',
        arguments: { path: 'admin/api-smoke-delete-target' }
      };

      const result = await toolExecutor.execute(toolCall, { channel: 'chat', context });

      expect(result.success).toBe(true);
      const deleteResult = result.data as DeleteEntryResult;
      expect(deleteResult.path).toBe('admin/api-smoke-alpha-task');
      expect(deleteResult.name).toBe('Api smoke alpha task');
      expect(mockEntryService.delete).toHaveBeenCalledWith('admin/api-smoke-alpha-task', 'chat');
      expect((deleteResult as any).receipt).toMatchObject({
        operation: 'delete',
        requestedPath: 'admin/api-smoke-delete-target',
        resolvedPath: 'admin/api-smoke-alpha-task'
      });
    });

    it('should use suggested_name for inbox entries', async () => {
      // Mock reading existing inbox entry
      const mockInboxEntry: EntryWithPath = {
        path: 'inbox/20240101120000-unclear-thought',
        category: 'inbox',
        entry: {
          id: 'test-id',
          original_text: 'Some unclear thought',
          suggested_category: 'ideas',
          suggested_name: 'Unclear Thought',
          confidence: 0.45,
          status: 'needs_review',
          source_channel: 'api',
          created_at: '2024-01-01T12:00:00Z'
        },
        content: ''
      };
      mockEntryService.read
        .mockResolvedValueOnce(mockInboxEntry)
        .mockRejectedValueOnce(new Error('Entry not found: inbox/20240101120000-unclear-thought'));
      mockEntryService.delete.mockResolvedValue(undefined);

      const toolCall: ToolCall = {
        name: 'delete_entry',
        arguments: { path: 'inbox/20240101120000-unclear-thought' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const deleteResult = result.data as DeleteEntryResult;
      expect(deleteResult.path).toBe('inbox/20240101120000-unclear-thought');
      expect(deleteResult.name).toBe('Unclear Thought');
      expect(deleteResult.category).toBe('inbox');
    });

    it('should validate required path argument', async () => {
      const toolCall: ToolCall = {
        name: 'delete_entry',
        arguments: {} // Missing required 'path'
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(result.error).toContain('path');
    });
  });

  describe('move_entry handler', () => {
    it('should move entry from one category to another', async () => {
      // Mock move result
      const mockMovedEntry: EntryWithPath = {
        path: 'ideas/test-project',
        category: 'ideas',
        entry: {
          id: 'test-id',
          name: 'Test Project',
          tags: ['important'],
          created_at: '2024-01-01T12:00:00Z',
          updated_at: '2024-01-03T12:00:00Z',
          source_channel: 'api',
          confidence: 0.85,
          one_liner: '',
          related_projects: []
        },
        content: ''
      };
      mockEntryService.move.mockResolvedValue(mockMovedEntry);

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'projects/test-project', targetCategory: 'ideas' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const moveResult = result.data as any;
      expect(moveResult.oldPath).toBe('projects/test-project');
      expect(moveResult.newPath).toBe('ideas/test-project');
      expect(moveResult.category).toBe('ideas');
      expect((moveResult as any).receipt).toMatchObject({
        operation: 'move',
        requestedPath: 'projects/test-project',
        resolvedPath: 'projects/test-project'
      });
      expect((moveResult as any).receipt.verification.verified).toBe(true);

      // Verify move was called with correct args
      expect(mockEntryService.move).toHaveBeenCalledWith('projects/test-project', 'ideas', 'api');
    });

    it('should move inbox entry to classified category using suggested_name', async () => {
      // Mock move result
      const mockMovedEntry: EntryWithPath = {
        path: 'people/john-doe',
        category: 'people',
        entry: {
          id: 'test-id',
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
      mockEntryService.move.mockResolvedValue(mockMovedEntry);

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'inbox/20240101120000-unclear-thought', targetCategory: 'people' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const moveResult = result.data as any;
      expect(moveResult.oldPath).toBe('inbox/20240101120000-unclear-thought');
      expect(moveResult.newPath).toBe('people/john-doe');
      expect(moveResult.category).toBe('people');

      // Verify move was called with correct args
      expect(mockEntryService.move).toHaveBeenCalledWith('inbox/20240101120000-unclear-thought', 'people', 'api');
    });

    it('should handle non-existent entry error', async () => {
      mockEntryService.move.mockRejectedValue(new Error('Entry not found: projects/non-existent'));

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'projects/non-existent', targetCategory: 'ideas' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Entry not found');
      expect(mockEntryService.move).toHaveBeenCalledWith('projects/non-existent', 'ideas', 'api');
    });

    it('should handle create error and not delete original entry', async () => {
      mockEntryService.move.mockRejectedValue(new Error('Failed to create entry'));

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'projects/test-project', targetCategory: 'ideas' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to create entry');
      expect(mockEntryService.move).toHaveBeenCalledWith('projects/test-project', 'ideas', 'api');
    });

    it('should transform entry to admin category with correct defaults', async () => {
      // Mock move result
      const mockMovedEntry: EntryWithPath = {
        path: 'admin/test-idea',
        category: 'admin',
        entry: {
          id: 'test-id',
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
      mockEntryService.move.mockResolvedValue(mockMovedEntry);

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'ideas/test-idea', targetCategory: 'admin' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(mockEntryService.move).toHaveBeenCalledWith('ideas/test-idea', 'admin', 'api');
    });
  });

  describe('search_entries handler', () => {
    it('should return matching entries for a search query', async () => {
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [
          { path: 'projects/test-project', name: 'Test Project', category: 'projects', matchedField: 'name', snippet: 'Test Project' },
          { path: 'ideas/test-idea', name: 'Test Idea', category: 'ideas', matchedField: 'one_liner', snippet: 'A test idea' }
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
      expect(searchResult.entries[0].path).toBe('projects/test-project');
      expect(searchResult.entries[1].path).toBe('ideas/test-idea');
      expect(mockSearchService.search).toHaveBeenCalledWith('test', { category: undefined, limit: undefined });
    });

    it('should filter by category when provided', async () => {
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [
          { path: 'ideas/great-idea', name: 'Great Idea', category: 'ideas', matchedField: 'one_liner', snippet: 'A great test idea' }
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
          { path: 'projects/project-a', name: 'Project A', category: 'projects', matchedField: 'name', snippet: 'Project A test' },
          { path: 'projects/project-b', name: 'Project B', category: 'projects', matchedField: 'content', snippet: '...test content...' }
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
          { path: 'people/john-doe', name: 'John Doe', category: 'people', matchedField: 'context', snippet: '...test context...' }
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

  describe('find_duplicates handler', () => {
    it('should return duplicate candidates', async () => {
      mockDuplicateService.findDuplicatesForText = jest.fn().mockResolvedValue([
        {
          path: 'projects/test-project',
          name: 'Test Project',
          category: 'projects',
          matchedField: 'name',
          snippet: 'Test Project',
          score: 0.92,
          reason: 'name_similarity'
        }
      ]);

      const toolCall: ToolCall = {
        name: 'find_duplicates',
        arguments: { name: 'Test Project', category: 'projects' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(mockDuplicateService.findDuplicatesForText).toHaveBeenCalledWith({
        name: 'Test Project',
        text: undefined,
        category: 'projects',
        limit: undefined,
        excludePath: undefined
      });
    });
  });

  describe('merge_entries handler', () => {
    it('should merge entries into the target', async () => {
      const mergedEntry = {
        path: 'projects/merged',
        category: 'projects',
        entry: { id: '1', name: 'Merged' },
        content: ''
      } as EntryWithPath;
      mockEntryService.merge = jest.fn().mockResolvedValue(mergedEntry);

      const toolCall: ToolCall = {
        name: 'merge_entries',
        arguments: { targetPath: 'projects/merged', sourcePaths: ['projects/a'] }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(mockEntryService.merge).toHaveBeenCalledWith('projects/merged', ['projects/a'], 'api');
    });
  });

  describe('execute() - other tools', () => {
    it('should dispatch to list_entries handler with all filters', async () => {
      const mockEntries: EntrySummary[] = [
        { id: 'entry-project-a', path: 'projects/project-a', name: 'Project A', category: 'projects', updated_at: '2024-01-01T12:00:00Z', status: 'active' }
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
        path: 'projects/test',
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
        arguments: { path: 'projects/test', updates: { status: 'done' } }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(mockEntryService.update).toHaveBeenCalledWith('projects/test', { status: 'done' }, 'api', undefined);
    });

    it('should dispatch to move_entry handler', async () => {
      // Mock move result
      const mockMovedEntry: EntryWithPath = {
        path: 'projects/test-idea',
        category: 'projects',
        entry: {
          id: 'test-id',
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
      mockEntryService.move.mockResolvedValue(mockMovedEntry);

      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'inbox/20240101120000-test-idea', targetCategory: 'projects' }
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      const moveResult = result.data as any;
      expect(moveResult.oldPath).toBe('inbox/20240101120000-test-idea');
      expect(moveResult.newPath).toBe('projects/test-idea');
      expect(moveResult.category).toBe('projects');
      expect(mockEntryService.move).toHaveBeenCalledWith('inbox/20240101120000-test-idea', 'projects', 'api');
    });

    it('should dispatch to search_entries handler', async () => {
      mockSearchService.search = jest.fn().mockResolvedValue({
        entries: [
          { path: 'projects/test-project', name: 'Test Project', category: 'projects', matchedField: 'name', snippet: 'Test Project' }
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
          { path: 'ideas/great-idea', name: 'Great Idea', category: 'ideas', matchedField: 'one_liner', snippet: 'A test idea' }
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

    it('should validate required fields for move_entry', async () => {
      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'test' } // Missing required 'targetCategory'
      };

      const result = await toolExecutor.execute(toolCall);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid arguments');
      expect(result.error).toContain('targetCategory');
    });

    it('should validate targetCategory enum for move_entry', async () => {
      const toolCall: ToolCall = {
        name: 'move_entry',
        arguments: { path: 'test', targetCategory: 'invalid' }
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

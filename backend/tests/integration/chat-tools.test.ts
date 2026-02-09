/**
 * Integration Tests for Chat Tools Orchestration
 * 
 * Tests the full orchestration flow from processMessageWithTools through tool execution
 * to final response generation.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { ChatService, resetChatService } from '../../src/services/chat.service';
import { ConversationService, resetConversationService } from '../../src/services/conversation.service';
import { ContextAssembler, resetContextAssembler } from '../../src/services/context.service';
import { SummarizationService, resetSummarizationService } from '../../src/services/summarization.service';
import { ToolRegistry, getToolRegistry } from '../../src/services/tool-registry';
import { ToolExecutor, CaptureResult, ListEntriesResult, GetEntryResult } from '../../src/services/tool-executor';
import { Category } from '../../src/types/entry.types';
import { getPrismaClient, disconnectPrisma } from '../../src/lib/prisma';
import OpenAI from 'openai';
import { resetDatabase } from '../setup';

// ============================================
// Mock Factories
// ============================================

/**
 * Create a mock ContextAssembler that returns minimal context
 */
const createMockContextAssembler = () => {
  return {
    assemble: jest.fn().mockResolvedValue({
      systemPrompt: 'Test system prompt',
      indexContent: '# Index\n\nTest index content',
      summaries: [],
      recentMessages: []
    })
  } as unknown as ContextAssembler;
};

/**
 * Create a mock SummarizationService that does nothing
 */
const createMockSummarizationService = () => {
  return {
    checkAndSummarize: jest.fn().mockResolvedValue(undefined)
  } as unknown as SummarizationService;
};

/**
 * Create a mock EntryService to avoid file system/git dependencies
 */
const createMockEntryService = () => {
  return {
    create: jest.fn(),
    read: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    list: jest.fn()
  };
};

/**
 * Create a mock ClassificationAgent to avoid OpenAI dependencies
 */
const createMockClassificationAgent = () => {
  return {
    classify: jest.fn()
  };
};

// ============================================
// Test Suite
// ============================================

describe('Chat Tools Integration', () => {
  const prisma = getPrismaClient();
  let conversationService: ConversationService;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    // Reset singletons
    resetChatService();
    resetConversationService();
    resetContextAssembler();
    resetSummarizationService();
    
    conversationService = new ConversationService();

    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  // ============================================
  // Test 1: Tool Selection Flow
  // ============================================

  describe('Tool Selection Flow', () => {
    /**
     * Test: Mock OpenAI to return classify_and_capture tool call, verify entry is created
     * 
     * Requirements 2.1: Send message to OpenAI with all available tool schemas
     * Requirements 2.2: Execute tool when LLM returns a tool call
     * Requirements 2.5: Send tool results back to LLM for response generation
     */
    it('should execute classify_and_capture tool when LLM returns tool call', async () => {
      const toolCallId = 'call_capture_123';
      const expectedPath = 'projects/test-project';
      const expectedCategory: Category = 'projects';
      const expectedName = 'Test Project';
      const expectedConfidence = 0.85;

      // Create mock OpenAI that returns classify_and_capture tool call
      let openAICallCount = 0;
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockImplementation(() => {
              openAICallCount++;
              
              if (openAICallCount === 1) {
                // First call: Return tool call for classify_and_capture
                return Promise.resolve({
                  choices: [{
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [{
                        id: toolCallId,
                        type: 'function',
                        function: {
                          name: 'classify_and_capture',
                          arguments: JSON.stringify({ text: 'Working on a new project called Test Project' })
                        }
                      }]
                    },
                    finish_reason: 'tool_calls'
                  }]
                });
              } else {
                // Second call: Return final response after tool execution
                return Promise.resolve({
                  choices: [{
                    message: {
                      role: 'assistant',
                      content: `I've captured "Test Project" as a project. You can find it at ${expectedPath}.`
                    },
                    finish_reason: 'stop'
                  }]
                });
              }
            })
          }
        }
      } as unknown as OpenAI;

      // Create mock ToolExecutor that returns a predictable CaptureResult
      const mockToolExecutor = {
        execute: jest.fn().mockImplementation(async (
          toolCall: { name: string; arguments: Record<string, unknown> }
        ) => {
          if (toolCall.name === 'classify_and_capture') {
            const captureResult: CaptureResult = {
              path: expectedPath,
              category: expectedCategory,
              name: expectedName,
              confidence: expectedConfidence,
              clarificationNeeded: false
            };
            return { success: true, data: captureResult };
          }
          return { success: false, error: 'Unknown tool' };
        })
      } as unknown as ToolExecutor;

      // Create ChatService with mocks
      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      // Process message
      const response = await chatService.processMessageWithTools(
        null,
        'Working on a new project called Test Project'
      );

      // Verify OpenAI was called twice (initial + after tool execution)
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);

      // Verify tool was executed
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(1);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        {
          name: 'classify_and_capture',
          arguments: { text: 'Working on a new project called Test Project' }
        },
        {
          channel: 'chat',
          context: expect.objectContaining({
            systemPrompt: 'Test system prompt',
            indexContent: '# Index\n\nTest index content',
            summaries: expect.any(Array),
            recentMessages: expect.any(Array)
          })
        }
      );

      // Verify response contains entry info
      expect(response.entry).toBeDefined();
      expect(response.entry?.path).toBe(expectedPath);
      expect(response.entry?.category).toBe(expectedCategory);
      expect(response.entry?.name).toBe(expectedName);
      expect(response.entry?.confidence).toBe(expectedConfidence);

      // Verify toolsUsed is populated
      expect(response.toolsUsed).toContain('classify_and_capture');
      expect(response.message.quickReplies).toBeUndefined();

      // Verify message metadata is stored
      const messages = await conversationService.getMessages(response.conversationId);
      const assistantMessage = messages.find(m => m.role === 'assistant');
      expect(assistantMessage?.filedEntryPath).toBe(expectedPath);
      expect(assistantMessage?.filedConfidence).toBe(expectedConfidence);
    });

    it('should use deterministic relationship capture response and skip second LLM response', async () => {
      const toolCallId = 'call_relationship_capture';
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [{
                    id: toolCallId,
                    type: 'function',
                    function: {
                      name: 'classify_and_capture',
                      arguments: JSON.stringify({ text: 'Chris and Amie have a relationship' })
                    }
                  }]
                },
                finish_reason: 'tool_calls'
              }]
            })
          }
        }
      } as unknown as OpenAI;

      const mockToolExecutor = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            path: 'people/chris',
            category: 'people',
            name: 'Chris',
            confidence: 0.95,
            clarificationNeeded: false,
            captureKind: 'people_relationship',
            relatedPeople: ['Chris', 'Amie']
          } as CaptureResult
        })
      } as unknown as ToolExecutor;

      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      const response = await chatService.processMessageWithTools(
        null,
        'Chris and Amie have a relationship'
      );

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(response.message.content).toContain('Chris and Amie');
      expect(response.message.content.toLowerCase()).toContain('linked');
      expect(response.message.content.toLowerCase()).not.toContain('add amie');
      expect(response.entry?.path).toBe('people/chris');
      expect(response.toolsUsed).toContain('classify_and_capture');
    });

    it('should use deterministic duplicate-capture response and skip second LLM response', async () => {
      const toolCallId = 'call_capture_duplicate';
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: null,
                  tool_calls: [{
                    id: toolCallId,
                    type: 'function',
                    function: {
                      name: 'classify_and_capture',
                      arguments: JSON.stringify({ text: 'I have to finish the q4 Tax Report by tomorrow eod' })
                    }
                  }]
                },
                finish_reason: 'tool_calls'
              }]
            })
          }
        }
      } as unknown as OpenAI;

      const mockToolExecutor = {
        execute: jest.fn().mockResolvedValue({
          success: false,
          error: 'Entry already exists: task/finish-q4-tax-report'
        })
      } as unknown as ToolExecutor;

      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      const response = await chatService.processMessageWithTools(
        null,
        'I have to finish the q4 Tax Report by tomorrow eod'
      );

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(response.toolsUsed).toContain('classify_and_capture');
      expect(response.message.content).toContain('task/finish-q4-tax-report');
      expect(response.message.content.toLowerCase()).toContain('did not create a duplicate');
      expect(response.message.content.toLowerCase()).not.toContain("can't capture");
      expect(response.message.quickReplies).toEqual([
        { id: 'confirm_yes', label: 'Yes', message: 'Yes' },
        { id: 'confirm_no', label: 'No', message: 'No' }
      ]);
      expect(response.entry).toBeUndefined();
    });
  });

  // ============================================
  // Test 2: Conversational Flow
  // ============================================

  describe('Conversational Flow', () => {
    /**
     * Test: Mock OpenAI to return no tools, verify direct response
     * 
     * Requirements 2.4: Return LLM's conversational response when no tool is called
     */
    it('should return direct response when LLM returns no tool calls', async () => {
      const expectedResponse = 'Hello! How can I help you today?';

      // Create mock OpenAI that returns conversational response (no tool calls)
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: expectedResponse,
                  tool_calls: undefined
                },
                finish_reason: 'stop'
              }]
            })
          }
        }
      } as unknown as OpenAI;

      // Create mock ToolExecutor (should not be called)
      const mockToolExecutor = {
        execute: jest.fn()
      } as unknown as ToolExecutor;

      // Create ChatService with mocks
      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      // Process message
      const response = await chatService.processMessageWithTools(
        null,
        'Hello!'
      );

      // Verify OpenAI was called only once (no tool execution loop)
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);

      // Verify tool executor was NOT called
      expect(mockToolExecutor.execute).not.toHaveBeenCalled();

      // Verify response content
      expect(response.message.content).toBe(expectedResponse);
      expect(response.message.quickReplies).toBeUndefined();

      // Verify no entry was created
      expect(response.entry).toBeUndefined();

      // Verify toolsUsed is undefined or empty
      expect(response.toolsUsed).toBeUndefined();

      // Verify message has no entry metadata
      const messages = await conversationService.getMessages(response.conversationId);
      const assistantMessage = messages.find(m => m.role === 'assistant');
      expect(assistantMessage?.filedEntryPath).toBeUndefined();
      expect(assistantMessage?.filedConfidence).toBeUndefined();
    });

    /**
     * Test: Verify conversation is created and messages are stored
     */
    it('should create conversation and store messages for conversational flow', async () => {
      const userMessage = 'What can you help me with?';
      const assistantResponse = 'I can help you capture thoughts, query your knowledge base, and more!';

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: assistantResponse,
                  tool_calls: undefined
                },
                finish_reason: 'stop'
              }]
            })
          }
        }
      } as unknown as OpenAI;

      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        { execute: jest.fn() } as unknown as ToolExecutor,
        mockOpenAI
      );

      const response = await chatService.processMessageWithTools(null, userMessage);

      // Verify conversation was created
      expect(response.conversationId).toBeDefined();

      // Verify messages were stored
      const messages = await conversationService.getMessages(response.conversationId);
      expect(messages.length).toBe(2);
      
      const storedUserMessage = messages.find(m => m.role === 'user');
      const storedAssistantMessage = messages.find(m => m.role === 'assistant');
      
      expect(storedUserMessage?.content).toBe(userMessage);
      expect(storedAssistantMessage?.content).toBe(assistantResponse);
    });

    it('should capture the previous user intent when user confirms in a follow-up turn', async () => {
      const firstTurnAssistant =
        'It sounds like a task. Would you like me to capture that as a task for you?';
      const expectedPath = 'task/retail-demo-one-pagers';
      const expectedName = 'Draft retail demo one-pagers';

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: firstTurnAssistant,
                  tool_calls: undefined
                },
                finish_reason: 'stop'
              }]
            })
          }
        }
      } as unknown as OpenAI;

      const mockToolExecutor = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            path: expectedPath,
            category: 'task',
            name: expectedName,
            confidence: 0.91,
            clarificationNeeded: false
          } satisfies CaptureResult
        })
      } as unknown as ToolExecutor;

      const contextAssembler = {
        assemble: jest.fn().mockImplementation(async (conversationId: string) => ({
          systemPrompt: 'Test system prompt',
          indexContent: '# Index\n\nTest index content',
          summaries: [],
          recentMessages: await conversationService.getMessages(conversationId)
        }))
      } as unknown as ContextAssembler;

      const chatService = new ChatService(
        conversationService,
        contextAssembler,
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      const first = await chatService.processMessageWithTools(
        null,
        'I need to start drafting the first version of the retail demo one pagers by Sunday evening'
      );
      expect(first.message.quickReplies).toEqual([
        { id: 'capture_task', label: 'Yes, task', message: 'Yes as a task' },
        { id: 'capture_project', label: 'Yes, project', message: 'Yes as a project' },
        { id: 'capture_idea', label: 'Yes, idea', message: 'Yes as an idea' },
        { id: 'capture_no', label: 'No', message: 'No, do not save that' }
      ]);
      const second = await chatService.processMessageWithTools(
        first.conversationId,
        'Yes as a task'
      );

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(1);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        {
          name: 'classify_and_capture',
          arguments: expect.objectContaining({
            text: 'I need to start drafting the first version of the retail demo one pagers by Sunday evening',
            hints: expect.stringContaining('task')
          })
        },
        expect.objectContaining({
          channel: 'chat'
        })
      );
      expect(second.entry?.path).toBe(expectedPath);
      expect(second.message.content).toContain(expectedName);
      expect(second.message.quickReplies).toBeUndefined();
    });

    it('should not force capture when follow-up turn declines confirmation', async () => {
      const firstTurnAssistant =
        'It sounds like a task. Would you like me to capture that as a task for you?';
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: firstTurnAssistant,
                  tool_calls: undefined
                },
                finish_reason: 'stop'
              }]
            })
          }
        }
      } as unknown as OpenAI;

      const mockToolExecutor = {
        execute: jest.fn()
      } as unknown as ToolExecutor;

      const contextAssembler = {
        assemble: jest.fn().mockImplementation(async (conversationId: string) => ({
          systemPrompt: 'Test system prompt',
          indexContent: '# Index\n\nTest index content',
          summaries: [],
          recentMessages: await conversationService.getMessages(conversationId)
        }))
      } as unknown as ContextAssembler;

      const chatService = new ChatService(
        conversationService,
        contextAssembler,
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      const first = await chatService.processMessageWithTools(
        null,
        'I need to draft retail demo one pagers by Sunday evening'
      );
      const second = await chatService.processMessageWithTools(
        first.conversationId,
        'No, do not save that'
      );

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(1);
      expect(mockToolExecutor.execute).not.toHaveBeenCalled();
      expect(second.message.content).toBe("Okay, I won't save it.");
      expect(second.entry).toBeUndefined();
    });

    it('should keep pending capture intent across an extra turn before confirmation', async () => {
      const firstTurnAssistant =
        'It sounds like a task. Would you like me to capture that as a task for you?';
      const secondTurnAssistant = 'I can save it as a task, project, or idea.';
      const expectedPath = 'task/retail-demo-one-pagers';
      const expectedName = 'Draft retail demo one-pagers';

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest
              .fn()
              .mockResolvedValueOnce({
                choices: [{
                  message: {
                    role: 'assistant',
                    content: firstTurnAssistant,
                    tool_calls: undefined
                  },
                  finish_reason: 'stop'
                }]
              })
              .mockResolvedValueOnce({
                choices: [{
                  message: {
                    role: 'assistant',
                    content: secondTurnAssistant,
                    tool_calls: undefined
                  },
                  finish_reason: 'stop'
                }]
              })
          }
        }
      } as unknown as OpenAI;

      const mockToolExecutor = {
        execute: jest.fn().mockResolvedValue({
          success: true,
          data: {
            path: expectedPath,
            category: 'task',
            name: expectedName,
            confidence: 0.91,
            clarificationNeeded: false
          } satisfies CaptureResult
        })
      } as unknown as ToolExecutor;

      const contextAssembler = {
        assemble: jest.fn().mockImplementation(async (conversationId: string) => ({
          systemPrompt: 'Test system prompt',
          indexContent: '# Index\n\nTest index content',
          summaries: [],
          recentMessages: await conversationService.getMessages(conversationId)
        }))
      } as unknown as ContextAssembler;

      const chatService = new ChatService(
        conversationService,
        contextAssembler,
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      const first = await chatService.processMessageWithTools(
        null,
        'I need to start drafting the first version of the retail demo one pagers by Sunday evening'
      );
      const second = await chatService.processMessageWithTools(
        first.conversationId,
        'What category would that be?'
      );
      const third = await chatService.processMessageWithTools(
        second.conversationId,
        'Yes as a task'
      );

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(1);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        {
          name: 'classify_and_capture',
          arguments: expect.objectContaining({
            text: 'I need to start drafting the first version of the retail demo one pagers by Sunday evening',
            hints: expect.stringContaining('task')
          })
        },
        expect.objectContaining({
          channel: 'chat'
        })
      );
      expect(third.entry?.path).toBe(expectedPath);
      expect(third.message.content).toContain(expectedName);
    });

    it('should execute reopen on follow-up confirmation after fallback prompt', async () => {
      const updateResult = {
        path: 'task/finish-q4-2025-tax-report',
        category: 'task' as const,
        name: 'Finish Q4 2025 Tax Report',
        updated_fields: ['status'],
        confidence: 0.95,
        verification: {
          checked: ['status'],
          mismatches: []
        },
        receipt: {
          tool: 'update_entry' as const,
          target: { path: 'task/finish-q4-2025-tax-report' },
          requested: { updates: { status: 'pending' } },
          applied: { updates: { status: 'pending' } },
          verification: { checked: ['status'], mismatches: [] },
          at: new Date().toISOString()
        }
      };

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest
              .fn()
              .mockResolvedValueOnce({
                choices: [{
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{
                      id: 'call_update_error_123',
                      type: 'function',
                      function: {
                        name: 'update_entry',
                        arguments: JSON.stringify({
                          path: 'task/finish-q4-2025-tax-report',
                          updates: { status: 'pending' }
                        })
                      }
                    }]
                  },
                  finish_reason: 'tool_calls'
                }]
              })
          }
        }
      } as unknown as OpenAI;

      const mockToolExecutor = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({
            success: false,
            error: 'Entry not found: task/finish-q4-2025-tax-report'
          })
          .mockResolvedValueOnce({
            success: true,
            data: updateResult
          })
      } as unknown as ToolExecutor;

      const mockEntryService = createMockEntryService() as any;
      mockEntryService.list.mockResolvedValue([
        {
          id: 'done-1',
          path: 'task/finish-q4-2025-tax-report',
          name: 'Finish Q4 2025 Tax Report',
          category: 'task',
          updated_at: new Date().toISOString(),
          status: 'done'
        }
      ]);

      const chatService = new ChatService(
        conversationService,
        {
          assemble: jest.fn().mockImplementation(async (conversationId: string) => ({
            systemPrompt: 'Test system prompt',
            indexContent: '# Index\n\nTest index content',
            summaries: [],
            recentMessages: await conversationService.getMessages(conversationId)
          }))
        } as unknown as ContextAssembler,
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        mockEntryService,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      const first = await chatService.processMessageWithTools(
        null,
        'Please bring back the task Finish Q4 2025 Tax Report'
      );
      const second = await chatService.processMessageWithTools(
        first.conversationId,
        'Yes'
      );

      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(2);
      expect(mockToolExecutor.execute).toHaveBeenLastCalledWith(
        {
          name: 'update_entry',
          arguments: {
            path: 'task/finish-q4-2025-tax-report',
            updates: { status: 'pending' }
          }
        },
        expect.objectContaining({
          channel: 'chat'
        })
      );
      expect(second.message.content).toContain('back to pending');
      expect(second.entry?.path).toBe('task/finish-q4-2025-tax-report');
    });

    it('should execute reopen when user selects numbered fallback option', async () => {
      const updateResult = {
        path: 'task/finish-q4-2025-tax-review',
        category: 'task' as const,
        name: 'Finish Q4 2025 Tax Review',
        updated_fields: ['status'],
        confidence: 0.95,
        verification: {
          checked: ['status'],
          mismatches: []
        },
        receipt: {
          tool: 'update_entry' as const,
          target: { path: 'task/finish-q4-2025-tax-review' },
          requested: { updates: { status: 'pending' } },
          applied: { updates: { status: 'pending' } },
          verification: { checked: ['status'], mismatches: [] },
          at: new Date().toISOString()
        }
      };

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest
              .fn()
              .mockResolvedValueOnce({
                choices: [{
                  message: {
                    role: 'assistant',
                    content: null,
                    tool_calls: [{
                      id: 'call_update_error_999',
                      type: 'function',
                      function: {
                        name: 'update_entry',
                        arguments: JSON.stringify({
                          path: 'task/finish-q4-2025-tax-report',
                          updates: { status: 'pending' }
                        })
                      }
                    }]
                  },
                  finish_reason: 'tool_calls'
                }]
              })
          }
        }
      } as unknown as OpenAI;

      const mockToolExecutor = {
        execute: jest
          .fn()
          .mockResolvedValueOnce({
            success: false,
            error: 'Entry not found: task/finish-q4-2025-tax-report'
          })
          .mockResolvedValueOnce({
            success: true,
            data: updateResult
          })
      } as unknown as ToolExecutor;

      const mockEntryService = createMockEntryService() as any;
      mockEntryService.list.mockResolvedValue([
        {
          id: 'done-1',
          path: 'task/finish-q4-2025-tax-report',
          name: 'Finish Q4 2025 Tax Report',
          category: 'task',
          updated_at: new Date().toISOString(),
          status: 'done'
        },
        {
          id: 'done-2',
          path: 'task/finish-q4-2025-tax-review',
          name: 'Finish Q4 2025 Tax Review',
          category: 'task',
          updated_at: new Date().toISOString(),
          status: 'done'
        }
      ]);

      const chatService = new ChatService(
        conversationService,
        {
          assemble: jest.fn().mockImplementation(async (conversationId: string) => ({
            systemPrompt: 'Test system prompt',
            indexContent: '# Index\n\nTest index content',
            summaries: [],
            recentMessages: await conversationService.getMessages(conversationId)
          }))
        } as unknown as ContextAssembler,
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        mockEntryService,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      const first = await chatService.processMessageWithTools(
        null,
        'Bring back finish q4 tax'
      );
      const second = await chatService.processMessageWithTools(
        first.conversationId,
        '2'
      );

      expect(first.message.content).toContain('multiple completed tasks');
      expect(second.entry?.path).toBe('task/finish-q4-2025-tax-review');
      expect(mockToolExecutor.execute).toHaveBeenLastCalledWith(
        {
          name: 'update_entry',
          arguments: {
            path: 'task/finish-q4-2025-tax-review',
            updates: { status: 'pending' }
          }
        },
        expect.objectContaining({
          channel: 'chat'
        })
      );
    });

    it('should attach generic yes-no quick replies for non-capture assistant confirmations', async () => {
      const assistantPrompt = 'Would you like me to help you phrase that better?';
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: assistantPrompt,
                  tool_calls: undefined
                },
                finish_reason: 'stop'
              }]
            })
          }
        }
      } as unknown as OpenAI;

      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        { execute: jest.fn() } as unknown as ToolExecutor,
        mockOpenAI
      );

      const response = await chatService.processMessageWithTools(
        null,
        'Can you help me with this wording?'
      );

      expect(response.message.quickReplies).toEqual([
        { id: 'confirm_yes', label: 'Yes', message: 'Yes' },
        { id: 'confirm_no', label: 'No', message: 'No' }
      ]);
    });

    it('should attach disambiguation quick replies for numbered options', async () => {
      const assistantPrompt = [
        'I found multiple entries that could match. Which one should I update?',
        '1. Finish Q4 2025 Tax Report (task/finish-q4-2025-tax-report)',
        '2. Finish Q4 2025 Tax Review (task/finish-q4-2025-tax-review)'
      ].join('\n');

      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: assistantPrompt,
                  tool_calls: undefined
                },
                finish_reason: 'stop'
              }]
            })
          }
        }
      } as unknown as OpenAI;

      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        { execute: jest.fn() } as unknown as ToolExecutor,
        mockOpenAI
      );

      const response = await chatService.processMessageWithTools(
        null,
        'Update the Q4 tax item'
      );

      expect(response.message.quickReplies).toEqual([
        { id: 'select_1', label: 'Use #1', message: '1' },
        { id: 'select_2', label: 'Use #2', message: '2' }
      ]);
    });
  });

  // ============================================
  // Test 3: Multi-Tool Flow
  // ============================================

  describe('Multi-Tool Flow', () => {
    /**
     * Test: Mock OpenAI to return multiple tool calls, verify sequential execution
     * 
     * Requirements 2.3: Execute multiple tool calls in sequence and aggregate results
     */
    it('should execute multiple tool calls in sequence', async () => {
      const listToolCallId = 'call_list_123';
      const getToolCallId = 'call_get_456';

      // Mock data for list_entries result
      const listEntriesResult: ListEntriesResult = {
        entries: [
          { id: 'entry-project-a', path: 'projects/project-a', name: 'Project A', category: 'projects' as Category, updated_at: '2024-01-01T00:00:00Z' },
          { id: 'entry-project-b', path: 'projects/project-b', name: 'Project B', category: 'projects' as Category, updated_at: '2024-01-01T00:00:00Z' }
        ],
        total: 2
      };

      // Mock data for get_entry result
      const getEntryResult: GetEntryResult = {
        entry: {
          path: 'projects/project-a',
          category: 'projects' as Category,
          entry: {
            id: 'test-id-123',
            name: 'Project A',
            status: 'active',
            next_action: 'Review requirements',
            tags: ['important'],
            confidence: 0.9,
            source_channel: 'chat' as const,
            related_people: [],
            created_at: '2024-01-01T00:00:00Z',
            updated_at: '2024-01-01T00:00:00Z'
          },
          content: '# Project A\n\nProject content here'
        }
      };

      // Create mock OpenAI that returns multiple tool calls
      let openAICallCount = 0;
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockImplementation(() => {
              openAICallCount++;
              
              if (openAICallCount === 1) {
                // First call: Return multiple tool calls
                return Promise.resolve({
                  choices: [{
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [
                        {
                          id: listToolCallId,
                          type: 'function',
                          function: {
                            name: 'list_entries',
                            arguments: JSON.stringify({ category: 'projects', limit: 5 })
                          }
                        },
                        {
                          id: getToolCallId,
                          type: 'function',
                          function: {
                            name: 'get_entry',
                            arguments: JSON.stringify({ path: 'projects/project-a' })
                          }
                        }
                      ]
                    },
                    finish_reason: 'tool_calls'
                  }]
                });
              } else {
                // Second call: Return final response after tool execution
                return Promise.resolve({
                  choices: [{
                    message: {
                      role: 'assistant',
                      content: 'You have 2 projects. Project A is active with next action: Review requirements.'
                    },
                    finish_reason: 'stop'
                  }]
                });
              }
            })
          }
        }
      } as unknown as OpenAI;

      // Create mock ToolExecutor that handles both tools
      const mockToolExecutor = {
        execute: jest.fn().mockImplementation(async (
          toolCall: { name: string; arguments: Record<string, unknown> }
        ) => {
          if (toolCall.name === 'list_entries') {
            return { success: true, data: listEntriesResult };
          }
          if (toolCall.name === 'get_entry') {
            return { success: true, data: getEntryResult };
          }
          return { success: false, error: 'Unknown tool' };
        })
      } as unknown as ToolExecutor;

      // Create ChatService with mocks
      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      // Process message
      const response = await chatService.processMessageWithTools(
        null,
        'Show me my projects and tell me about Project A'
      );

      // Verify OpenAI was called twice (initial + after tool execution)
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);

      // Verify both tools were executed
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(2);
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        {
          name: 'list_entries',
          arguments: { category: 'projects', limit: 5 }
        },
        {
          channel: 'chat',
          context: expect.objectContaining({
            systemPrompt: 'Test system prompt',
            indexContent: '# Index\n\nTest index content',
            summaries: expect.any(Array),
            recentMessages: expect.any(Array)
          })
        }
      );
      expect(mockToolExecutor.execute).toHaveBeenCalledWith(
        {
          name: 'get_entry',
          arguments: { path: 'projects/project-a' }
        },
        {
          channel: 'chat',
          context: expect.objectContaining({
            systemPrompt: 'Test system prompt',
            indexContent: '# Index\n\nTest index content',
            summaries: expect.any(Array),
            recentMessages: expect.any(Array)
          })
        }
      );

      // Verify toolsUsed contains both tools
      expect(response.toolsUsed).toContain('list_entries');
      expect(response.toolsUsed).toContain('get_entry');

      // Verify response content
      expect(response.message.content).toContain('2 projects');
    });
  });

  // ============================================
  // Test 4: Error Handling Flow
  // ============================================

  describe('Error Handling Flow', () => {
    /**
     * Test: Force tool failure, verify error is sent back to LLM
     * 
     * Requirements 2.6: Return error message to LLM on tool failure
     */
    it('should send error back to LLM when tool execution fails', async () => {
      const toolCallId = 'call_get_error_123';
      const errorMessage = 'Entry not found: projects/nonexistent';

      // Create mock OpenAI that returns a tool call, then handles error
      let openAICallCount = 0;
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockImplementation(() => {
              openAICallCount++;
              
              if (openAICallCount === 1) {
                // First call: Return tool call for get_entry
                return Promise.resolve({
                  choices: [{
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [{
                        id: toolCallId,
                        type: 'function',
                        function: {
                          name: 'get_entry',
                          arguments: JSON.stringify({ path: 'projects/nonexistent' })
                        }
                      }]
                    },
                    finish_reason: 'tool_calls'
                  }]
                });
              } else {
                // Second call: LLM generates error response based on tool error
                return Promise.resolve({
                  choices: [{
                    message: {
                      role: 'assistant',
                      content: "I couldn't find that entry. It may have been moved or deleted."
                    },
                    finish_reason: 'stop'
                  }]
                });
              }
            })
          }
        }
      } as unknown as OpenAI;

      // Create mock ToolExecutor that returns an error
      const mockToolExecutor = {
        execute: jest.fn().mockResolvedValue({
          success: false,
          error: errorMessage
        })
      } as unknown as ToolExecutor;

      // Create ChatService with mocks
      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      // Process message
      const response = await chatService.processMessageWithTools(
        null,
        'Show me the project at projects/nonexistent'
      );

      // Verify OpenAI was called twice (initial + after tool error)
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);

      // Verify tool was executed
      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(1);

      // Verify the second OpenAI call included the error in tool results
      const createMock = mockOpenAI.chat.completions.create as jest.Mock;
      const secondCall = createMock.mock.calls[1];
      const messagesInSecondCall = secondCall[0].messages;
      
      // Find the tool result message
      const toolResultMessage = messagesInSecondCall.find(
        (m: any) => m.role === 'tool'
      );
      expect(toolResultMessage).toBeDefined();
      expect(toolResultMessage.content).toContain('success');
      expect(toolResultMessage.content).toContain('false');
      expect(toolResultMessage.content).toContain(errorMessage);

      // Verify response is user-friendly
      expect(response.message.content).toContain("couldn't find");

      // Verify no entry was created
      expect(response.entry).toBeUndefined();
    });

    it('should offer to reopen a completed admin task when update_entry fails', async () => {
      const toolCallId = 'call_update_error_123';
      const errorMessage = 'Entry not found: task/finish-q4-2025-tax-report';

      let openAICallCount = 0;
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockImplementation(() => {
              openAICallCount++;

              if (openAICallCount === 1) {
                return Promise.resolve({
                  choices: [{
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [{
                        id: toolCallId,
                        type: 'function',
                        function: {
                          name: 'update_entry',
                          arguments: JSON.stringify({
                            path: 'task/finish-q4-2025-tax-report',
                            updates: { status: 'pending' }
                          })
                        }
                      }]
                    },
                    finish_reason: 'tool_calls'
                  }]
                });
              }

              return Promise.resolve({
                choices: [{
                  message: {
                    role: 'assistant',
                    content: 'Fallback should have prevented a second call.'
                  },
                  finish_reason: 'stop'
                }]
              });
            })
          }
        }
      } as unknown as OpenAI;

      const mockToolExecutor = {
        execute: jest.fn().mockResolvedValue({
          success: false,
          error: errorMessage
        })
      } as unknown as ToolExecutor;

      const mockEntryService = createMockEntryService() as any;
      mockEntryService.list.mockResolvedValue([
        {
          id: 'done-1',
          path: 'task/finish-q4-2025-tax-report',
          name: 'Finish Q4 2025 Tax Report',
          category: 'task',
          updated_at: new Date().toISOString(),
          status: 'done'
        }
      ]);

      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        mockEntryService,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      const response = await chatService.processMessageWithTools(
        null,
        'Please bring back the task Finish Q4 2025 Tax Report'
      );

      expect(mockToolExecutor.execute).toHaveBeenCalledTimes(1);
      expect(mockEntryService.list).toHaveBeenCalledWith('task', { status: 'done' });
      expect(openAICallCount).toBe(1);
      expect(response.message.content).toContain('Finish Q4 2025 Tax Report');
      expect(response.message.content.toLowerCase()).toContain('set it back to pending');
    });

    /**
     * Test: Handle invalid JSON arguments from LLM
     */
    it('should handle invalid JSON arguments gracefully', async () => {
      const toolCallId = 'call_invalid_json_123';

      // Create mock OpenAI that returns tool call with invalid JSON
      let openAICallCount = 0;
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockImplementation(() => {
              openAICallCount++;
              
              if (openAICallCount === 1) {
                // First call: Return tool call with invalid JSON arguments
                return Promise.resolve({
                  choices: [{
                    message: {
                      role: 'assistant',
                      content: null,
                      tool_calls: [{
                        id: toolCallId,
                        type: 'function',
                        function: {
                          name: 'get_entry',
                          arguments: 'not valid json {'
                        }
                      }]
                    },
                    finish_reason: 'tool_calls'
                  }]
                });
              } else {
                // Second call: LLM handles the error
                return Promise.resolve({
                  choices: [{
                    message: {
                      role: 'assistant',
                      content: 'I had trouble processing that request. Could you try again?'
                    },
                    finish_reason: 'stop'
                  }]
                });
              }
            })
          }
        }
      } as unknown as OpenAI;

      // Create mock ToolExecutor (should not be called due to JSON parse error)
      const mockToolExecutor = {
        execute: jest.fn()
      } as unknown as ToolExecutor;

      // Create ChatService with mocks
      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        mockToolExecutor,
        mockOpenAI
      );

      // Process message
      const response = await chatService.processMessageWithTools(
        null,
        'Get some entry'
      );

      // Verify OpenAI was called twice
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);

      // Verify tool executor was NOT called (JSON parse failed before execution)
      expect(mockToolExecutor.execute).not.toHaveBeenCalled();

      // Verify the second OpenAI call included the JSON error
      const createMock = mockOpenAI.chat.completions.create as jest.Mock;
      const secondCall = createMock.mock.calls[1];
      const messagesInSecondCall = secondCall[0].messages;
      
      const toolResultMessage = messagesInSecondCall.find(
        (m: any) => m.role === 'tool'
      );
      expect(toolResultMessage).toBeDefined();
      expect(toolResultMessage.content).toContain('Invalid JSON arguments');

      // Verify response is generated
      expect(response.message.content).toBeDefined();
    });
  });

  // ============================================
  // Test 5: Context Assembly
  // ============================================

  describe('Context Assembly', () => {
    /**
     * Test: Verify context assembler is called with conversation ID
     */
    it('should assemble context for existing conversation', async () => {
      // First create a conversation
      const conversation = await conversationService.create('chat');

      const mockContextAssembler = createMockContextAssembler();
      
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: 'Response based on context',
                  tool_calls: undefined
                },
                finish_reason: 'stop'
              }]
            })
          }
        }
      } as unknown as OpenAI;

      const chatService = new ChatService(
        conversationService,
        mockContextAssembler,
        createMockClassificationAgent() as any,
        createMockSummarizationService(),
        createMockEntryService() as any,
        getToolRegistry(),
        { execute: jest.fn() } as unknown as ToolExecutor,
        mockOpenAI
      );

      await chatService.processMessageWithTools(conversation.id, 'Follow up question');

      // Verify context assembler was called with the conversation ID
      expect(mockContextAssembler.assemble).toHaveBeenCalledWith(conversation.id);
    });
  });

  // ============================================
  // Test 6: Summarization Trigger
  // ============================================

  describe('Summarization Trigger', () => {
    /**
     * Test: Verify summarization check is triggered after message storage
     */
    it('should trigger summarization check after processing message', async () => {
      const mockSummarizationService = createMockSummarizationService();
      
      const mockOpenAI = {
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  role: 'assistant',
                  content: 'Test response',
                  tool_calls: undefined
                },
                finish_reason: 'stop'
              }]
            })
          }
        }
      } as unknown as OpenAI;

      const chatService = new ChatService(
        conversationService,
        createMockContextAssembler(),
        createMockClassificationAgent() as any,
        mockSummarizationService,
        createMockEntryService() as any,
        getToolRegistry(),
        { execute: jest.fn() } as unknown as ToolExecutor,
        mockOpenAI
      );

      const response = await chatService.processMessageWithTools(null, 'Test message');

      // Verify summarization check was called with the conversation ID
      expect(mockSummarizationService.checkAndSummarize).toHaveBeenCalledWith(response.conversationId);
    });
  });
});

/**
 * Property Tests: Message Metadata Persistence
 * 
 * Feature: llm-tool-routing, Property 8: Message Metadata Persistence
 * 
 * *For any* tool execution that creates an entry (classify_and_capture), the stored 
 * assistant message SHALL contain:
 * - `filedEntryPath` matching the created entry's path
 * - `filedConfidence` matching the classification confidence score
 * 
 * **Validates: Requirements 8.3**
 */

import * as fc from 'fast-check';
import { getPrismaClient, disconnectPrisma } from '../../src/lib/prisma';
import { ChatService, resetChatService } from '../../src/services/chat.service';
import { ConversationService, resetConversationService } from '../../src/services/conversation.service';
import { ContextAssembler, resetContextAssembler } from '../../src/services/context.service';
import { SummarizationService, resetSummarizationService } from '../../src/services/summarization.service';
import { ToolRegistry, getToolRegistry } from '../../src/services/tool-registry';
import { ToolExecutor, CaptureResult } from '../../src/services/tool-executor';
import { Category } from '../../src/types/entry.types';
import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';

// ============================================
// Test Configuration
// ============================================

const TEST_BRAIN_PATH = path.join(__dirname, '../../test-brain-metadata');

// ============================================
// Mock Factories
// ============================================

/**
 * Create a mock OpenAI client that returns a classify_and_capture tool call
 * followed by a final response after tool execution
 */
const createMockOpenAI = (toolCallId: string = 'call_test123') => {
  let callCount = 0;
  
  return {
    chat: {
      completions: {
        create: jest.fn().mockImplementation(() => {
          callCount++;
          
          if (callCount === 1) {
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
                      arguments: JSON.stringify({ text: 'Test thought to capture' })
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
                  content: 'I\'ve captured that thought for you!'
                },
                finish_reason: 'stop'
              }]
            });
          }
        })
      }
    }
  } as unknown as OpenAI;
};

/**
 * Create a mock ToolExecutor that returns a predictable CaptureResult
 */
const createMockToolExecutor = (
  entryPath: string,
  category: Category,
  name: string,
  confidence: number
) => {
  return {
    execute: jest.fn().mockImplementation(async (toolCall: { name: string; arguments: Record<string, unknown> }) => {
      if (toolCall.name === 'classify_and_capture') {
        const captureResult: CaptureResult = {
          path: entryPath,
          category,
          name,
          confidence,
          clarificationNeeded: confidence < 0.6
        };
        return {
          success: true,
          data: captureResult
        };
      }
      return { success: false, error: 'Unknown tool' };
    })
  } as unknown as ToolExecutor;
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

/**
 * Create a mock ContextAssembler that returns minimal context
 */
const createMockContextAssembler = () => {
  return {
    assemble: jest.fn().mockResolvedValue({
      systemPrompt: 'Test system prompt',
      indexContent: '# Index\n\nTest index',
      summaries: [],
      recentMessages: []
    })
  } as unknown as ContextAssembler;
};

// ============================================
// Test Arbitraries
// ============================================

// Category arbitrary (excluding inbox for high-confidence captures)
const categoryArbitrary = fc.constantFrom('people', 'projects', 'ideas', 'admin') as fc.Arbitrary<Category>;

// Entry name arbitrary
const entryNameArbitrary = fc.string({ minLength: 3, maxLength: 30 })
  .filter(s => /[a-zA-Z]/.test(s))
  .map(s => s.replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'Test Entry');

// Confidence score arbitrary (0.0 to 1.0)
const confidenceArbitrary = fc.float({ min: 0, max: 1, noNaN: true });

// Slug generator (matches the actual slug generation logic)
const generateSlug = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50) || 'untitled';
};

// ============================================
// Property Tests
// ============================================

describe('Property Tests: Message Metadata Persistence', () => {
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

    // Clean up test data before each test
    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({});
      await tx.conversationSummary.deleteMany({});
      await tx.conversation.deleteMany({});
    });
  });

  afterAll(async () => {
    // Clean up all test data
    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({});
      await tx.conversationSummary.deleteMany({});
      await tx.conversation.deleteMany({});
    });
    await disconnectPrisma();
  });

  /**
   * Property 8: Message Metadata Persistence
   * 
   * Feature: llm-tool-routing, Property 8: Message Metadata Persistence
   * 
   * *For any* tool execution that creates an entry (classify_and_capture), the stored 
   * assistant message SHALL contain:
   * - `filedEntryPath` matching the created entry's path
   * - `filedConfidence` matching the classification confidence score
   * 
   * **Validates: Requirements 8.3**
   */
  describe('Property 8: Message Metadata Persistence', () => {
    it('assistant message SHALL contain filedEntryPath matching the created entry path', async () => {
      await fc.assert(
        fc.asyncProperty(
          categoryArbitrary,
          entryNameArbitrary,
          confidenceArbitrary,
          async (category, name, confidence) => {
            // Generate expected entry path
            const slug = generateSlug(name);
            const expectedPath = `${category}/${slug}.md`;

            // Create mocks
            const mockOpenAI = createMockOpenAI();
            const mockToolExecutor = createMockToolExecutor(expectedPath, category, name, confidence);
            const mockSummarizationService = createMockSummarizationService();
            const mockContextAssembler = createMockContextAssembler();
            const mockEntryService = createMockEntryService();
            const mockClassificationAgent = createMockClassificationAgent();
            const toolRegistry = getToolRegistry();

            // Create ChatService with mocks
            const chatService = new ChatService(
              conversationService,
              mockContextAssembler,
              mockClassificationAgent as any,
              mockSummarizationService,
              mockEntryService as any,
              toolRegistry,
              mockToolExecutor,
              mockOpenAI
            );

            // Process message with tools
            const response = await chatService.processMessageWithTools(
              null, // Create new conversation
              'Remember this thought for me'
            );

            // Verify the response contains the entry info
            expect(response.entry).toBeDefined();
            expect(response.entry?.path).toBe(expectedPath);

            // Verify the stored assistant message has filedEntryPath
            const messages = await conversationService.getMessages(response.conversationId);
            const assistantMessage = messages.find(m => m.role === 'assistant');
            
            // Property: filedEntryPath SHALL match the created entry's path
            expect(assistantMessage).toBeDefined();
            expect(assistantMessage?.filedEntryPath).toBe(expectedPath);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('assistant message SHALL contain filedConfidence matching the classification confidence score', async () => {
      await fc.assert(
        fc.asyncProperty(
          categoryArbitrary,
          entryNameArbitrary,
          confidenceArbitrary,
          async (category, name, confidence) => {
            // Generate expected entry path
            const slug = generateSlug(name);
            const expectedPath = `${category}/${slug}.md`;

            // Create mocks
            const mockOpenAI = createMockOpenAI();
            const mockToolExecutor = createMockToolExecutor(expectedPath, category, name, confidence);
            const mockSummarizationService = createMockSummarizationService();
            const mockContextAssembler = createMockContextAssembler();
            const mockEntryService = createMockEntryService();
            const mockClassificationAgent = createMockClassificationAgent();
            const toolRegistry = getToolRegistry();

            // Create ChatService with mocks
            const chatService = new ChatService(
              conversationService,
              mockContextAssembler,
              mockClassificationAgent as any,
              mockSummarizationService,
              mockEntryService as any,
              toolRegistry,
              mockToolExecutor,
              mockOpenAI
            );

            // Process message with tools
            const response = await chatService.processMessageWithTools(
              null,
              'Remember this thought for me'
            );

            // Verify the response contains the confidence
            expect(response.entry).toBeDefined();
            expect(response.entry?.confidence).toBe(confidence);

            // Verify the stored assistant message has filedConfidence
            const messages = await conversationService.getMessages(response.conversationId);
            const assistantMessage = messages.find(m => m.role === 'assistant');
            
            // Property: filedConfidence SHALL match the classification confidence score
            expect(assistantMessage).toBeDefined();
            // Use toBeCloseTo for floating-point comparison to handle precision differences
            expect(assistantMessage?.filedConfidence).toBeCloseTo(confidence, 10);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('assistant message metadata SHALL match entry info in response for any category', async () => {
      await fc.assert(
        fc.asyncProperty(
          categoryArbitrary,
          entryNameArbitrary,
          confidenceArbitrary,
          async (category, name, confidence) => {
            // Generate expected entry path
            const slug = generateSlug(name);
            const expectedPath = `${category}/${slug}.md`;

            // Create mocks
            const mockOpenAI = createMockOpenAI();
            const mockToolExecutor = createMockToolExecutor(expectedPath, category, name, confidence);
            const mockSummarizationService = createMockSummarizationService();
            const mockContextAssembler = createMockContextAssembler();
            const mockEntryService = createMockEntryService();
            const mockClassificationAgent = createMockClassificationAgent();
            const toolRegistry = getToolRegistry();

            // Create ChatService with mocks
            const chatService = new ChatService(
              conversationService,
              mockContextAssembler,
              mockClassificationAgent as any,
              mockSummarizationService,
              mockEntryService as any,
              toolRegistry,
              mockToolExecutor,
              mockOpenAI
            );

            // Process message with tools
            const response = await chatService.processMessageWithTools(
              null,
              'Remember this thought for me'
            );

            // Get stored messages
            const messages = await conversationService.getMessages(response.conversationId);
            const assistantMessage = messages.find(m => m.role === 'assistant');

            // Property: Both filedEntryPath and filedConfidence SHALL be present and match
            expect(assistantMessage).toBeDefined();
            expect(assistantMessage?.filedEntryPath).toBe(response.entry?.path);
            // Use toBeCloseTo for floating-point comparison to handle precision differences
            expect(assistantMessage?.filedConfidence).toBeCloseTo(response.entry?.confidence ?? 0, 10);
            
            // Verify the response message also contains the metadata
            expect(response.message.filedEntryPath).toBe(expectedPath);
            expect(response.message.filedConfidence).toBeCloseTo(confidence, 10);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('assistant message SHALL NOT have metadata when no entry is created (conversational response)', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.string({ minLength: 5, maxLength: 50 }),
          async (userMessage) => {
            // Create mock OpenAI that returns conversational response (no tool calls)
            const mockOpenAI = {
              chat: {
                completions: {
                  create: jest.fn().mockResolvedValue({
                    choices: [{
                      message: {
                        role: 'assistant',
                        content: 'Hello! How can I help you today?',
                        tool_calls: undefined
                      },
                      finish_reason: 'stop'
                    }]
                  })
                }
              }
            } as unknown as OpenAI;

            const mockSummarizationService = createMockSummarizationService();
            const mockContextAssembler = createMockContextAssembler();
            const mockEntryService = createMockEntryService();
            const mockClassificationAgent = createMockClassificationAgent();
            const toolRegistry = getToolRegistry();

            // Create ChatService with mocks
            const chatService = new ChatService(
              conversationService,
              mockContextAssembler,
              mockClassificationAgent as any,
              mockSummarizationService,
              mockEntryService as any,
              toolRegistry,
              { execute: jest.fn() } as any, // Mock ToolExecutor - won't be called since no tool calls
              mockOpenAI
            );

            // Process message with tools
            const response = await chatService.processMessageWithTools(
              null,
              userMessage
            );

            // Verify no entry was created
            expect(response.entry).toBeUndefined();

            // Get stored messages
            const messages = await conversationService.getMessages(response.conversationId);
            const assistantMessage = messages.find(m => m.role === 'assistant');

            // Property: When no entry is created, metadata SHALL be undefined
            expect(assistantMessage).toBeDefined();
            expect(assistantMessage?.filedEntryPath).toBeUndefined();
            expect(assistantMessage?.filedConfidence).toBeUndefined();
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

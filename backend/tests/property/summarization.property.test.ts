/**
 * Property Tests: Summarization Service
 * 
 * Property 13: Summarization Trigger
 * For any conversation where the total message count exceeds
 * (MAX_VERBATIM_MESSAGES + SUMMARIZE_BATCH_SIZE), the system SHALL create a
 * ConversationSummary covering the oldest SUMMARIZE_BATCH_SIZE messages
 * (excluding the most recent MAX_VERBATIM_MESSAGES).
 * 
 * **Validates: Requirements 9.1**
 * 
 * Property 15: Message Retention After Summarization
 * For any conversation after summarization occurs, the most recent MAX_VERBATIM_MESSAGES
 * messages SHALL remain available verbatim (not summarized) in the context window.
 * 
 * **Validates: Requirements 9.5**
 */

import * as fc from 'fast-check';
import { getPrismaClient, disconnectPrisma } from '../../src/lib/prisma';
import {
  SummarizationService,
  resetSummarizationService,
} from '../../src/services/summarization.service';
import {
  ConversationService,
  resetConversationService,
  Role,
} from '../../src/services/conversation.service';
import {
  ContextAssembler,
  resetContextAssembler,
} from '../../src/services/context.service';
import { Channel } from '../../src/types/entry.types';
import OpenAI from 'openai';

// Mock OpenAI client
const createMockOpenAI = (summaryResponse: string = 'Test summary of conversation') => {
  return {
    chat: {
      completions: {
        create: jest.fn().mockResolvedValue({
          choices: [
            {
              message: {
                content: summaryResponse,
              },
            },
          ],
        }),
      },
    },
  } as unknown as OpenAI;
};

describe('Property Tests: Summarization Service', () => {
  let conversationService: ConversationService;
  const prisma = getPrismaClient();

  // Test configuration values
  const SUMMARIZE_BATCH_SIZE = 10;
  const MAX_VERBATIM_MESSAGES = 15;
  const SUMMARY_TRIGGER = MAX_VERBATIM_MESSAGES + SUMMARIZE_BATCH_SIZE;

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    resetConversationService();
    resetSummarizationService();
    conversationService = new ConversationService();

    // Clean up test data before each test using transaction
    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({});
      await tx.conversationSummary.deleteMany({});
      await tx.conversation.deleteMany({});
    });
  });

  afterAll(async () => {
    // Clean up all test data using transaction
    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({});
      await tx.conversationSummary.deleteMany({});
      await tx.conversation.deleteMany({});
    });
    await disconnectPrisma();
  });

  // ============================================
  // Arbitraries for generating test data
  // ============================================

  const channelArb = fc.constantFrom('chat', 'email', 'api') as fc.Arbitrary<Channel>;
  const roleArb = fc.constantFrom('user', 'assistant') as fc.Arbitrary<Role>;

  // ============================================
  // Property 13: Summarization Trigger
  // ============================================

  describe('Property 13: Summarization Trigger', () => {
    /**
     * Feature: chat-capture-and-classification, Property 13: Summarization Trigger
     * 
     * For any conversation where the total message count exceeds
     * (MAX_VERBATIM_MESSAGES + SUMMARIZE_BATCH_SIZE), the system SHALL create a
     * ConversationSummary covering the oldest SUMMARIZE_BATCH_SIZE messages
     * (excluding the most recent MAX_VERBATIM_MESSAGES).
     * 
     * **Validates: Requirements 9.1**
     */

    it('SHALL NOT create a summary when message count is at or below threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          // Generate message count at or below threshold (1 to SUMMARY_TRIGGER)
          fc.integer({ min: 1, max: SUMMARY_TRIGGER }),
          async (channel, messageCount) => {
            // Create mock OpenAI client
            const mockOpenAI = createMockOpenAI();
            const summarizationService = new SummarizationService(
              mockOpenAI,
              conversationService
            );

            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages up to or at the threshold
            for (let i = 0; i < messageCount; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              await conversationService.addMessage(
                conversation.id,
                role,
                `Message ${i + 1}`
              );
            }

            // Check and summarize
            await summarizationService.checkAndSummarize(conversation.id);

            // Property: No summary SHALL be created when at or below threshold
            const summaries = await conversationService.getSummaries(conversation.id);
            expect(summaries.length).toBe(0);

            // OpenAI should not have been called
            expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 3 } // Per steering guidelines: DB operations use 3-5 runs
      );
    });

    it('SHALL create a summary when message count exceeds threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          // Generate message count above threshold (threshold + 1 to threshold + 10)
          fc.integer({ min: SUMMARY_TRIGGER + 1, max: SUMMARY_TRIGGER + 10 }),
          async (channel, messageCount) => {
            // Create mock OpenAI client
            const mockOpenAI = createMockOpenAI('Generated summary for test');
            const summarizationService = new SummarizationService(
              mockOpenAI,
              conversationService
            );

            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages exceeding the threshold
            const createdMessages: Array<{ id: string }> = [];
            for (let i = 0; i < messageCount; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              const msg = await conversationService.addMessage(
                conversation.id,
                role,
                `Message ${i + 1}`
              );
              createdMessages.push(msg);
            }

            // Check and summarize
            await summarizationService.checkAndSummarize(conversation.id);

            // Property: A summary SHALL be created when exceeding threshold
            const summaries = await conversationService.getSummaries(conversation.id);
            expect(summaries.length).toBe(1);

            // OpenAI should have been called
            expect(mockOpenAI.chat.completions.create).toHaveBeenCalled();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('summary SHALL cover oldest messages excluding the most recent MAX_VERBATIM_MESSAGES', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          // Generate message count above threshold
          fc.integer({ min: SUMMARY_TRIGGER + 1, max: SUMMARY_TRIGGER + 15 }),
          async (channel, messageCount) => {
            // Create mock OpenAI client
            const mockOpenAI = createMockOpenAI('Summary covering oldest messages');
            const summarizationService = new SummarizationService(
              mockOpenAI,
              conversationService
            );

            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages exceeding the threshold
            const createdMessages: Array<{ id: string }> = [];
            for (let i = 0; i < messageCount; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              const msg = await conversationService.addMessage(
                conversation.id,
                role,
                `Message ${i + 1}`
              );
              createdMessages.push(msg);
            }

            // Check and summarize
            await summarizationService.checkAndSummarize(conversation.id);

            // Get the created summary
            const summaries = await conversationService.getSummaries(conversation.id);
            expect(summaries.length).toBe(1);

            const summary = summaries[0];

            // Property: Summary SHALL start from the first message
            expect(summary.startMessageId).toBe(createdMessages[0].id);

            // Property: Summary SHALL end at the end of the first batch
            const expectedEndIndex = SUMMARIZE_BATCH_SIZE - 1;
            expect(summary.endMessageId).toBe(createdMessages[expectedEndIndex].id);

            // Property: Message count in summary SHALL equal batch size
            const expectedMessageCount = SUMMARIZE_BATCH_SIZE;
            expect(summary.messageCount).toBe(expectedMessageCount);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL NOT re-summarize already summarized messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          async (channel) => {
            // Create mock OpenAI client
            const mockOpenAI = createMockOpenAI('First summary');
            const summarizationService = new SummarizationService(
              mockOpenAI,
              conversationService
            );

            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages exceeding the threshold
            const initialMessageCount = SUMMARY_TRIGGER + 5;
            const createdMessages: Array<{ id: string }> = [];
            for (let i = 0; i < initialMessageCount; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              const msg = await conversationService.addMessage(
                conversation.id,
                role,
                `Message ${i + 1}`
              );
              createdMessages.push(msg);
            }

            // First summarization
            await summarizationService.checkAndSummarize(conversation.id);

            // Verify first summary was created
            let summaries = await conversationService.getSummaries(conversation.id);
            expect(summaries.length).toBe(1);
            const firstSummary = summaries[0];

            // Reset mock call count
            (mockOpenAI.chat.completions.create as jest.Mock).mockClear();

            // Call checkAndSummarize again without adding new messages
            await summarizationService.checkAndSummarize(conversation.id);

            // Property: No new summary SHALL be created (already summarized)
            summaries = await conversationService.getSummaries(conversation.id);
            expect(summaries.length).toBe(1);
            expect(summaries[0].id).toBe(firstSummary.id);

            // OpenAI should NOT have been called again
            expect(mockOpenAI.chat.completions.create).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL create additional summary when new messages exceed threshold after previous summarization', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          async (channel) => {
            // Create mock OpenAI client
            let callCount = 0;
            const mockOpenAI = {
              chat: {
                completions: {
                  create: jest.fn().mockImplementation(() => {
                    callCount++;
                    return Promise.resolve({
                      choices: [
                        {
                          message: {
                            content: `Summary ${callCount}`,
                          },
                        },
                      ],
                    });
                  }),
                },
              },
            } as unknown as OpenAI;

            const summarizationService = new SummarizationService(
              mockOpenAI,
              conversationService
            );

            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages exceeding the threshold
            const initialMessageCount = SUMMARY_TRIGGER + 5;
            for (let i = 0; i < initialMessageCount; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              await conversationService.addMessage(
                conversation.id,
                role,
                `Initial message ${i + 1}`
              );
            }

            // First summarization
            await summarizationService.checkAndSummarize(conversation.id);

            // Verify first summary was created
            let summaries = await conversationService.getSummaries(conversation.id);
            expect(summaries.length).toBe(1);

            // Add more messages to exceed threshold again
            // We need to add enough messages so that unsummarized messages exceed threshold
            // After first summary: 15 verbatim messages remain
            // Need enough messages so that eligible messages reach another batch
            // After first summary: startIndex = SUMMARIZE_BATCH_SIZE
            // Next summary triggers when total >= startIndex + MAX_VERBATIM_MESSAGES + SUMMARIZE_BATCH_SIZE
            const additionalMessages = (SUMMARIZE_BATCH_SIZE + MAX_VERBATIM_MESSAGES + SUMMARIZE_BATCH_SIZE) - initialMessageCount;
            for (let i = 0; i < additionalMessages; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              await conversationService.addMessage(
                conversation.id,
                role,
                `Additional message ${i + 1}`
              );
            }

            // Second summarization
            await summarizationService.checkAndSummarize(conversation.id);

            // Property: A second summary SHALL be created for new messages
            summaries = await conversationService.getSummaries(conversation.id);
            expect(summaries.length).toBe(2);

            // Verify summaries are in chronological order
            const firstSummaryTime = new Date(summaries[0].createdAt).getTime();
            const secondSummaryTime = new Date(summaries[1].createdAt).getTime();
            expect(secondSummaryTime).toBeGreaterThanOrEqual(firstSummaryTime);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('summary message count SHALL accurately reflect the number of messages covered', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          // Generate message count above threshold
          fc.integer({ min: SUMMARY_TRIGGER + 1, max: SUMMARY_TRIGGER + 20 }),
          async (channel, messageCount) => {
            // Create mock OpenAI client
            const mockOpenAI = createMockOpenAI('Summary with accurate count');
            const summarizationService = new SummarizationService(
              mockOpenAI,
              conversationService
            );

            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages exceeding the threshold
            for (let i = 0; i < messageCount; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              await conversationService.addMessage(
                conversation.id,
                role,
                `Message ${i + 1}`
              );
            }

            // Check and summarize
            await summarizationService.checkAndSummarize(conversation.id);

            // Get the created summary
            const summaries = await conversationService.getSummaries(conversation.id);
            expect(summaries.length).toBe(1);

            const summary = summaries[0];

            // Property: messageCount SHALL equal batch size
            const expectedMessageCount = SUMMARIZE_BATCH_SIZE;
            expect(summary.messageCount).toBe(expectedMessageCount);
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  // ============================================
  // Property 15: Message Retention After Summarization
  // ============================================

  describe('Property 15: Message Retention After Summarization', () => {
    /**
     * Feature: chat-capture-and-classification, Property 15: Message Retention After Summarization
     * 
     * For any conversation after summarization occurs, the most recent MAX_VERBATIM_MESSAGES
     * messages SHALL remain available verbatim (not summarized) in the context window.
     * 
     * **Validates: Requirements 9.5**
     */

    // Mock IndexService for ContextAssembler
    const createMockIndexService = () => ({
      getIndexContent: jest.fn().mockResolvedValue('# Index\n\nTest index content'),
    });

    it('SHALL return exactly MAX_VERBATIM_MESSAGES recent messages in context after summarization', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          // Generate message count above threshold
          fc.integer({ min: SUMMARY_TRIGGER + 1, max: SUMMARY_TRIGGER + 15 }),
          async (channel, messageCount) => {
            // Create mock OpenAI client
            const mockOpenAI = createMockOpenAI('Summary of older messages');
            const summarizationService = new SummarizationService(
              mockOpenAI,
              conversationService
            );

            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages exceeding the threshold
            const createdMessages: Array<{ id: string; content: string }> = [];
            for (let i = 0; i < messageCount; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              const content = `Message ${i + 1}`;
              const msg = await conversationService.addMessage(
                conversation.id,
                role,
                content
              );
              createdMessages.push({ id: msg.id, content });
            }

            // Perform summarization
            await summarizationService.checkAndSummarize(conversation.id);

            // Verify summary was created
            const summaries = await conversationService.getSummaries(conversation.id);
            expect(summaries.length).toBe(1);

            // Create ContextAssembler with mock IndexService
            const mockIndexService = createMockIndexService();
            const contextAssembler = new ContextAssembler(
              mockIndexService as any,
              conversationService,
              MAX_VERBATIM_MESSAGES
            );

            // Assemble context
            const context = await contextAssembler.assemble(conversation.id);

            // Property: Context SHALL contain exactly MAX_VERBATIM_MESSAGES recent messages
            expect(context.recentMessages.length).toBe(MAX_VERBATIM_MESSAGES);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('recent messages in context SHALL be the most recent ones (not summarized)', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          // Generate message count above threshold
          fc.integer({ min: SUMMARY_TRIGGER + 1, max: SUMMARY_TRIGGER + 10 }),
          async (channel, messageCount) => {
            // Create mock OpenAI client
            const mockOpenAI = createMockOpenAI('Summary of older messages');
            const summarizationService = new SummarizationService(
              mockOpenAI,
              conversationService
            );

            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages exceeding the threshold with unique content
            const createdMessages: Array<{ id: string; content: string }> = [];
            for (let i = 0; i < messageCount; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              const content = `Unique message content ${i + 1} - ${Date.now()}`;
              const msg = await conversationService.addMessage(
                conversation.id,
                role,
                content
              );
              createdMessages.push({ id: msg.id, content });
            }

            // Perform summarization
            await summarizationService.checkAndSummarize(conversation.id);

            // Create ContextAssembler with mock IndexService
            const mockIndexService = createMockIndexService();
            const contextAssembler = new ContextAssembler(
              mockIndexService as any,
              conversationService,
              MAX_VERBATIM_MESSAGES
            );

            // Assemble context
            const context = await contextAssembler.assemble(conversation.id);

            // Get the expected most recent messages (last MAX_VERBATIM_MESSAGES)
            const expectedRecentMessages = createdMessages.slice(-MAX_VERBATIM_MESSAGES);

            // Property: Recent messages SHALL match the most recent messages by ID
            expect(context.recentMessages.length).toBe(MAX_VERBATIM_MESSAGES);
            
            for (let i = 0; i < MAX_VERBATIM_MESSAGES; i++) {
              expect(context.recentMessages[i].id).toBe(expectedRecentMessages[i].id);
              expect(context.recentMessages[i].content).toBe(expectedRecentMessages[i].content);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('recent messages SHALL be verbatim (exact content preserved)', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          // Generate random message contents
          fc.array(
            fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
            { minLength: SUMMARY_TRIGGER + 1, maxLength: SUMMARY_TRIGGER + 5 }
          ),
          async (channel, messageContents) => {
            // Create mock OpenAI client
            const mockOpenAI = createMockOpenAI('Summary of older messages');
            const summarizationService = new SummarizationService(
              mockOpenAI,
              conversationService
            );

            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages with the generated content
            const createdMessages: Array<{ id: string; content: string }> = [];
            for (let i = 0; i < messageContents.length; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              const msg = await conversationService.addMessage(
                conversation.id,
                role,
                messageContents[i]
              );
              createdMessages.push({ id: msg.id, content: messageContents[i] });
            }

            // Perform summarization
            await summarizationService.checkAndSummarize(conversation.id);

            // Create ContextAssembler with mock IndexService
            const mockIndexService = createMockIndexService();
            const contextAssembler = new ContextAssembler(
              mockIndexService as any,
              conversationService,
              MAX_VERBATIM_MESSAGES
            );

            // Assemble context
            const context = await contextAssembler.assemble(conversation.id);

            // Get the expected most recent messages
            const expectedRecentMessages = createdMessages.slice(-MAX_VERBATIM_MESSAGES);

            // Property: Each recent message content SHALL be EXACTLY preserved (verbatim)
            for (let i = 0; i < context.recentMessages.length; i++) {
              // Content must be exactly the same - not summarized or modified
              expect(context.recentMessages[i].content).toBe(expectedRecentMessages[i].content);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('context SHALL include summaries alongside recent verbatim messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          // Generate message count above threshold
          fc.integer({ min: SUMMARY_TRIGGER + 1, max: SUMMARY_TRIGGER + 10 }),
          async (channel, messageCount) => {
            // Create mock OpenAI client
            const summaryText = 'Generated summary of older conversation messages';
            const mockOpenAI = createMockOpenAI(summaryText);
            const summarizationService = new SummarizationService(
              mockOpenAI,
              conversationService
            );

            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages exceeding the threshold
            for (let i = 0; i < messageCount; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              await conversationService.addMessage(
                conversation.id,
                role,
                `Message ${i + 1}`
              );
            }

            // Perform summarization
            await summarizationService.checkAndSummarize(conversation.id);

            // Create ContextAssembler with mock IndexService
            const mockIndexService = createMockIndexService();
            const contextAssembler = new ContextAssembler(
              mockIndexService as any,
              conversationService,
              MAX_VERBATIM_MESSAGES
            );

            // Assemble context
            const context = await contextAssembler.assemble(conversation.id);

            // Property: Context SHALL include both summaries AND recent messages
            expect(context.summaries.length).toBeGreaterThan(0);
            expect(context.recentMessages.length).toBe(MAX_VERBATIM_MESSAGES);

            // Verify the summary content is present
            expect(context.summaries[0].summary).toBe(summaryText);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('summarized messages SHALL NOT appear in recent messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          // Generate message count above threshold
          fc.integer({ min: SUMMARY_TRIGGER + 1, max: SUMMARY_TRIGGER + 10 }),
          async (channel, messageCount) => {
            // Create mock OpenAI client
            const mockOpenAI = createMockOpenAI('Summary of older messages');
            const summarizationService = new SummarizationService(
              mockOpenAI,
              conversationService
            );

            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages exceeding the threshold
            const createdMessages: Array<{ id: string }> = [];
            for (let i = 0; i < messageCount; i++) {
              const role: Role = i % 2 === 0 ? 'user' : 'assistant';
              const msg = await conversationService.addMessage(
                conversation.id,
                role,
                `Message ${i + 1}`
              );
              createdMessages.push({ id: msg.id });
            }

            // Perform summarization
            await summarizationService.checkAndSummarize(conversation.id);

            // Get the summary to find which messages were summarized
            const summaries = await conversationService.getSummaries(conversation.id);
            expect(summaries.length).toBe(1);

            const summary = summaries[0];

            // Find the indices of summarized messages
            const startIndex = createdMessages.findIndex((m) => m.id === summary.startMessageId);
            const endIndex = createdMessages.findIndex((m) => m.id === summary.endMessageId);
            
            // Get IDs of summarized messages
            const summarizedMessageIds = new Set(
              createdMessages.slice(startIndex, endIndex + 1).map((m) => m.id)
            );

            // Create ContextAssembler with mock IndexService
            const mockIndexService = createMockIndexService();
            const contextAssembler = new ContextAssembler(
              mockIndexService as any,
              conversationService,
              MAX_VERBATIM_MESSAGES
            );

            // Assemble context
            const context = await contextAssembler.assemble(conversation.id);

            // Property: None of the summarized messages SHALL appear in recent messages
            for (const recentMessage of context.recentMessages) {
              expect(summarizedMessageIds.has(recentMessage.id)).toBe(false);
            }
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

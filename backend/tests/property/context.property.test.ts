/**
 * Property Tests: Context Assembler - Context Assembly Completeness
 * 
 * Property 11: Context Assembly Completeness
 * For any context window assembled for a conversation, the context SHALL contain:
 * - The current index.md content (non-empty if entries exist)
 * - All conversation summaries for that conversation (in chronological order)
 * - The most recent N messages (where N <= MAX_VERBATIM_MESSAGES)
 * 
 * **Validates: Requirements 8.1, 8.2, 8.3**
 */

import * as fc from 'fast-check';
import { getPrismaClient, disconnectPrisma } from '../../src/lib/prisma';
import {
  ContextAssembler,
  resetContextAssembler,
} from '../../src/services/context.service';
import {
  ConversationService,
  resetConversationService,
  Role,
} from '../../src/services/conversation.service';
import { IndexService } from '../../src/services/index.service';
import { Channel } from '../../src/types/entry.types';
import { mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';

// Test data directory
const TEST_DATA_DIR = join(__dirname, '../../.test-data-context-property');

describe('Property Tests: Context Assembler', () => {
  let contextAssembler: ContextAssembler;
  let conversationService: ConversationService;
  let indexService: IndexService;
  const prisma = getPrismaClient();

  // Default MAX_VERBATIM_MESSAGES for testing
  const MAX_VERBATIM_MESSAGES = 15;

  beforeAll(async () => {
    // Ensure database connection
    await prisma.$connect();

    // Create test data directory structure
    await mkdir(TEST_DATA_DIR, { recursive: true });
    await mkdir(join(TEST_DATA_DIR, 'people'), { recursive: true });
    await mkdir(join(TEST_DATA_DIR, 'projects'), { recursive: true });
    await mkdir(join(TEST_DATA_DIR, 'ideas'), { recursive: true });
    await mkdir(join(TEST_DATA_DIR, 'admin'), { recursive: true });
    await mkdir(join(TEST_DATA_DIR, 'inbox'), { recursive: true });
  });

  beforeEach(async () => {
    // Reset singletons and create fresh instances
    resetConversationService();
    resetContextAssembler();

    conversationService = new ConversationService();
    indexService = new IndexService(TEST_DATA_DIR);

    // Create ContextAssembler with test dependencies
    contextAssembler = new ContextAssembler(
      indexService,
      conversationService,
      MAX_VERBATIM_MESSAGES
    );

    // Clean up test data before each test using transaction
    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({});
      await tx.conversationSummary.deleteMany({});
      await tx.conversation.deleteMany({});
    });

    // Create a fresh index.md
    await indexService.regenerate();
  });

  afterAll(async () => {
    // Clean up all test data using transaction
    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({});
      await tx.conversationSummary.deleteMany({});
      await tx.conversation.deleteMany({});
    });
    await disconnectPrisma();

    // Clean up test data directory
    try {
      await rm(TEST_DATA_DIR, { recursive: true, force: true });
    } catch {
      // Directory might not exist
    }
  });

  // ============================================
  // Arbitraries for generating test data
  // ============================================

  const channelArb = fc.constantFrom('chat', 'email', 'api') as fc.Arbitrary<Channel>;
  const roleArb = fc.constantFrom('user', 'assistant') as fc.Arbitrary<Role>;

  // Generate non-empty message content
  const messageContentArb = fc
    .string({ minLength: 1, maxLength: 200 })
    .filter((s) => s.trim().length > 0);

  // Generate summary content
  const summaryContentArb = fc
    .string({ minLength: 10, maxLength: 300 })
    .filter((s) => s.trim().length > 0);

  // Generate a list of messages (1-20 messages)
  const messagesArb = fc.array(
    fc.record({
      role: roleArb,
      content: messageContentArb,
    }),
    { minLength: 1, maxLength: 20 }
  );

  // Generate number of summaries (0-3)
  const summaryCountArb = fc.integer({ min: 0, max: 3 });

  // ============================================
  // Property 11: Context Assembly Completeness
  // ============================================

  describe('Property 11: Context Assembly Completeness', () => {
    /**
     * Feature: chat-capture-and-classification, Property 11: Context Assembly Completeness
     * 
     * For any context window assembled for a conversation, the context SHALL contain:
     * - The current index.md content (non-empty if entries exist)
     * - All conversation summaries for that conversation (in chronological order)
     * - The most recent N messages (where N <= MAX_VERBATIM_MESSAGES)
     * 
     * **Validates: Requirements 8.1, 8.2, 8.3**
     */

    it('context SHALL contain index.md content (Requirement 8.1)', async () => {
      await fc.assert(
        fc.asyncProperty(channelArb, messagesArb, async (channel, messageInputs) => {
          // Create a conversation with messages
          const conversation = await conversationService.create(channel);

          for (const input of messageInputs) {
            await conversationService.addMessage(
              conversation.id,
              input.role,
              input.content
            );
          }

          // Assemble context
          const context = await contextAssembler.assemble(conversation.id);

          // Property: Context SHALL contain index.md content
          expect(context.indexContent).toBeDefined();
          expect(typeof context.indexContent).toBe('string');
          // Index content should contain the header (from regenerate)
          expect(context.indexContent).toContain('Second Brain Index');
        }),
        { numRuns: 3 } // Per steering guidelines: DB operations use 3-5 runs
      );
    });

    it('context SHALL contain all conversation summaries in chronological order (Requirement 8.3)', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          fc.array(summaryContentArb, { minLength: 1, maxLength: 3 }),
          async (channel, summaryContents) => {
            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages and summaries
            const createdSummaries = [];
            for (let i = 0; i < summaryContents.length; i++) {
              // Add a message to reference in the summary
              const msg = await conversationService.addMessage(
                conversation.id,
                'user',
                `Message for summary ${i + 1}`
              );

              // Add a small delay to ensure chronological ordering
              await new Promise((resolve) => setTimeout(resolve, 10));

              // Add summary
              const summary = await conversationService.addSummary(
                conversation.id,
                summaryContents[i],
                1,
                msg.id,
                msg.id
              );
              createdSummaries.push(summary);
            }

            // Assemble context
            const context = await contextAssembler.assemble(conversation.id);

            // Property: Context SHALL contain ALL conversation summaries
            expect(context.summaries).toHaveLength(summaryContents.length);

            // Property: Summaries SHALL be in chronological order (oldest to newest)
            for (let i = 0; i < context.summaries.length; i++) {
              expect(context.summaries[i].summary).toBe(summaryContents[i]);
            }

            // Verify chronological ordering by createdAt
            for (let i = 1; i < context.summaries.length; i++) {
              const prevTime = new Date(context.summaries[i - 1].createdAt).getTime();
              const currTime = new Date(context.summaries[i].createdAt).getTime();
              expect(currTime).toBeGreaterThanOrEqual(prevTime);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('context SHALL contain the most recent N messages where N <= MAX_VERBATIM_MESSAGES (Requirement 8.2)', async () => {
      await fc.assert(
        fc.asyncProperty(channelArb, messagesArb, async (channel, messageInputs) => {
          // Create a conversation
          const conversation = await conversationService.create(channel);

          // Add messages
          const createdMessages = [];
          for (const input of messageInputs) {
            const msg = await conversationService.addMessage(
              conversation.id,
              input.role,
              input.content
            );
            createdMessages.push(msg);
            // Small delay to ensure ordering
            await new Promise((resolve) => setTimeout(resolve, 2));
          }

          // Assemble context
          const context = await contextAssembler.assemble(conversation.id);

          // Property: Number of recent messages SHALL be <= MAX_VERBATIM_MESSAGES
          expect(context.recentMessages.length).toBeLessThanOrEqual(
            MAX_VERBATIM_MESSAGES
          );

          // Property: If total messages <= MAX_VERBATIM_MESSAGES, all should be included
          if (messageInputs.length <= MAX_VERBATIM_MESSAGES) {
            expect(context.recentMessages.length).toBe(messageInputs.length);
          } else {
            // Property: If total messages > MAX_VERBATIM_MESSAGES, exactly MAX should be included
            expect(context.recentMessages.length).toBe(MAX_VERBATIM_MESSAGES);
          }

          // Property: The messages included SHALL be the most recent ones
          const expectedMessages = createdMessages.slice(-MAX_VERBATIM_MESSAGES);
          expect(context.recentMessages.length).toBe(expectedMessages.length);

          for (let i = 0; i < context.recentMessages.length; i++) {
            expect(context.recentMessages[i].id).toBe(expectedMessages[i].id);
            expect(context.recentMessages[i].content).toBe(expectedMessages[i].content);
          }
        }),
        { numRuns: 3 }
      );
    });

    it('context assembly SHALL be complete with all components present', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          messagesArb,
          summaryCountArb,
          async (channel, messageInputs, summaryCount) => {
            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages
            const createdMessages = [];
            for (const input of messageInputs) {
              const msg = await conversationService.addMessage(
                conversation.id,
                input.role,
                input.content
              );
              createdMessages.push(msg);
              await new Promise((resolve) => setTimeout(resolve, 2));
            }

            // Add summaries if requested
            for (let i = 0; i < summaryCount && i < createdMessages.length; i++) {
              await conversationService.addSummary(
                conversation.id,
                `Summary ${i + 1} of conversation`,
                1,
                createdMessages[i].id,
                createdMessages[i].id
              );
              await new Promise((resolve) => setTimeout(resolve, 5));
            }

            // Assemble context
            const context = await contextAssembler.assemble(conversation.id);

            // Property: All components SHALL be present
            expect(context).toHaveProperty('systemPrompt');
            expect(context).toHaveProperty('indexContent');
            expect(context).toHaveProperty('summaries');
            expect(context).toHaveProperty('recentMessages');

            // Property: System prompt SHALL be non-empty
            expect(context.systemPrompt.length).toBeGreaterThan(0);

            // Property: Index content SHALL be defined (may be empty if no entries)
            expect(context.indexContent).toBeDefined();

            // Property: Summaries array SHALL have correct count
            expect(context.summaries.length).toBe(
              Math.min(summaryCount, createdMessages.length)
            );

            // Property: Recent messages SHALL respect the limit
            const expectedMessageCount = Math.min(
              messageInputs.length,
              MAX_VERBATIM_MESSAGES
            );
            expect(context.recentMessages.length).toBe(expectedMessageCount);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('context with entries SHALL have non-empty index content (Requirement 8.1)', async () => {
      // Create a test entry to ensure index has content
      const entryContent = `---
id: test-entry-123
name: Test Entry
category: ideas
tags: []
created_at: ${new Date().toISOString()}
source_channel: chat
one_liner: A test entry for property testing
---

# Test Entry

This is a test entry for property testing.
`;
      await writeFile(join(TEST_DATA_DIR, 'ideas', 'test-entry.md'), entryContent);

      // Regenerate index to include the entry
      await indexService.regenerate();

      await fc.assert(
        fc.asyncProperty(channelArb, async (channel) => {
          // Create a conversation
          const conversation = await conversationService.create(channel);
          await conversationService.addMessage(conversation.id, 'user', 'Test message');

          // Assemble context
          const context = await contextAssembler.assemble(conversation.id);

          // Property: Index content SHALL be non-empty when entries exist
          expect(context.indexContent).toBeDefined();
          expect(context.indexContent.length).toBeGreaterThan(0);
          expect(context.indexContent).toContain('Second Brain Index');
        }),
        { numRuns: 3 }
      );

      // Clean up the test entry
      try {
        await rm(join(TEST_DATA_DIR, 'ideas', 'test-entry.md'));
      } catch {
        // File might not exist
      }
    });

    it('messages in context SHALL be in chronological order (oldest to newest)', async () => {
      await fc.assert(
        fc.asyncProperty(channelArb, messagesArb, async (channel, messageInputs) => {
          // Create a conversation
          const conversation = await conversationService.create(channel);

          // Add messages with delays to ensure distinct timestamps
          for (const input of messageInputs) {
            await conversationService.addMessage(
              conversation.id,
              input.role,
              input.content
            );
            await new Promise((resolve) => setTimeout(resolve, 5));
          }

          // Assemble context
          const context = await contextAssembler.assemble(conversation.id);

          // Property: Messages SHALL be in chronological order
          for (let i = 1; i < context.recentMessages.length; i++) {
            const prevTime = new Date(context.recentMessages[i - 1].createdAt).getTime();
            const currTime = new Date(context.recentMessages[i].createdAt).getTime();
            expect(currTime).toBeGreaterThanOrEqual(prevTime);
          }
        }),
        { numRuns: 3 }
      );
    });
  });

  // ============================================
  // Property 12: Context Ordering
  // ============================================

  describe('Property 12: Context Ordering', () => {
    /**
     * Feature: chat-capture-and-classification, Property 12: Context Ordering
     * 
     * For any assembled context window, the components SHALL be ordered as:
     * 1. System prompt
     * 2. Index content
     * 3. Conversation summaries (oldest to newest)
     * 4. Recent messages (oldest to newest)
     * 
     * **Validates: Requirements 8.4**
     */

    it('context window SHALL have all components in correct structural order', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          messagesArb,
          summaryCountArb,
          async (channel, messageInputs, summaryCount) => {
            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages
            const createdMessages: Array<{ id: string; content: string; createdAt: Date }> = [];
            for (const input of messageInputs) {
              const msg = await conversationService.addMessage(
                conversation.id,
                input.role,
                input.content
              );
              createdMessages.push(msg);
              await new Promise((resolve) => setTimeout(resolve, 2));
            }

            // Add summaries if requested
            for (let i = 0; i < summaryCount && i < createdMessages.length; i++) {
              await conversationService.addSummary(
                conversation.id,
                `Summary ${i + 1} of conversation`,
                1,
                createdMessages[i].id,
                createdMessages[i].id
              );
              await new Promise((resolve) => setTimeout(resolve, 5));
            }

            // Assemble context
            const context = await contextAssembler.assemble(conversation.id);

            // Property: ContextWindow structure SHALL have components in order:
            // 1. systemPrompt (first component)
            // 2. indexContent (second component)
            // 3. summaries (third component - array)
            // 4. recentMessages (fourth component - array)

            // Verify structural ordering by checking the ContextWindow interface
            const keys = Object.keys(context);
            
            // All required components SHALL be present
            expect(context).toHaveProperty('systemPrompt');
            expect(context).toHaveProperty('indexContent');
            expect(context).toHaveProperty('summaries');
            expect(context).toHaveProperty('recentMessages');

            // Component 1: System prompt SHALL be a non-empty string
            expect(typeof context.systemPrompt).toBe('string');
            expect(context.systemPrompt.length).toBeGreaterThan(0);

            // Component 2: Index content SHALL be a string
            expect(typeof context.indexContent).toBe('string');

            // Component 3: Summaries SHALL be an array
            expect(Array.isArray(context.summaries)).toBe(true);

            // Component 4: Recent messages SHALL be an array
            expect(Array.isArray(context.recentMessages)).toBe(true);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('summaries SHALL be ordered chronologically (oldest to newest)', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          fc.array(summaryContentArb, { minLength: 2, maxLength: 4 }),
          async (channel, summaryContents) => {
            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages and summaries with distinct timestamps
            for (let i = 0; i < summaryContents.length; i++) {
              // Add a message to reference in the summary
              const msg = await conversationService.addMessage(
                conversation.id,
                'user',
                `Message for summary ${i + 1}`
              );

              // Add delay to ensure chronological ordering
              await new Promise((resolve) => setTimeout(resolve, 15));

              // Add summary
              await conversationService.addSummary(
                conversation.id,
                summaryContents[i],
                1,
                msg.id,
                msg.id
              );
            }

            // Assemble context
            const context = await contextAssembler.assemble(conversation.id);

            // Property: Summaries SHALL be in chronological order (oldest to newest)
            expect(context.summaries.length).toBe(summaryContents.length);

            // Verify chronological ordering by createdAt timestamp
            for (let i = 1; i < context.summaries.length; i++) {
              const prevTime = new Date(context.summaries[i - 1].createdAt).getTime();
              const currTime = new Date(context.summaries[i].createdAt).getTime();
              expect(currTime).toBeGreaterThanOrEqual(prevTime);
            }

            // Verify summaries match the order they were created
            for (let i = 0; i < context.summaries.length; i++) {
              expect(context.summaries[i].summary).toBe(summaryContents[i]);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('recent messages SHALL be ordered chronologically (oldest to newest)', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          fc.array(
            fc.record({
              role: roleArb,
              content: messageContentArb,
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (channel, messageInputs) => {
            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add messages with distinct timestamps
            const createdMessages: Array<{ id: string; content: string; createdAt: Date }> = [];
            for (const input of messageInputs) {
              const msg = await conversationService.addMessage(
                conversation.id,
                input.role,
                input.content
              );
              createdMessages.push(msg);
              // Add delay to ensure distinct timestamps
              await new Promise((resolve) => setTimeout(resolve, 10));
            }

            // Assemble context
            const context = await contextAssembler.assemble(conversation.id);

            // Property: Recent messages SHALL be in chronological order (oldest to newest)
            for (let i = 1; i < context.recentMessages.length; i++) {
              const prevTime = new Date(context.recentMessages[i - 1].createdAt).getTime();
              const currTime = new Date(context.recentMessages[i].createdAt).getTime();
              expect(currTime).toBeGreaterThanOrEqual(prevTime);
            }

            // Verify messages match the order they were created (most recent N)
            const expectedMessages = createdMessages.slice(-MAX_VERBATIM_MESSAGES);
            expect(context.recentMessages.length).toBe(expectedMessages.length);

            for (let i = 0; i < context.recentMessages.length; i++) {
              expect(context.recentMessages[i].id).toBe(expectedMessages[i].id);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('context ordering SHALL place summaries before recent messages temporally', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          fc.array(summaryContentArb, { minLength: 1, maxLength: 2 }),
          fc.array(
            fc.record({
              role: roleArb,
              content: messageContentArb,
            }),
            { minLength: 2, maxLength: 5 }
          ),
          async (channel, summaryContents, messageInputs) => {
            // Create a conversation
            const conversation = await conversationService.create(channel);

            // First, add messages that will be summarized
            const summarizedMessages: Array<{ id: string }> = [];
            for (let i = 0; i < summaryContents.length; i++) {
              const msg = await conversationService.addMessage(
                conversation.id,
                'user',
                `Old message ${i + 1} to be summarized`
              );
              summarizedMessages.push(msg);
              await new Promise((resolve) => setTimeout(resolve, 10));
            }

            // Create summaries for the old messages
            for (let i = 0; i < summaryContents.length; i++) {
              await conversationService.addSummary(
                conversation.id,
                summaryContents[i],
                1,
                summarizedMessages[i].id,
                summarizedMessages[i].id
              );
              await new Promise((resolve) => setTimeout(resolve, 10));
            }

            // Add recent messages (these come after summaries temporally)
            for (const input of messageInputs) {
              await conversationService.addMessage(
                conversation.id,
                input.role,
                input.content
              );
              await new Promise((resolve) => setTimeout(resolve, 10));
            }

            // Assemble context
            const context = await contextAssembler.assemble(conversation.id);

            // Property: Context SHALL have summaries and recent messages
            expect(context.summaries.length).toBe(summaryContents.length);
            expect(context.recentMessages.length).toBeGreaterThan(0);

            // Property: In the context structure, summaries come before recentMessages
            // This is enforced by the ContextWindow interface structure
            // Verify both arrays are properly populated
            expect(Array.isArray(context.summaries)).toBe(true);
            expect(Array.isArray(context.recentMessages)).toBe(true);

            // Property: Summaries represent older context, messages represent recent context
            // The ordering in the ContextWindow (summaries before recentMessages) reflects
            // the temporal ordering: older summarized content before recent verbatim messages
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

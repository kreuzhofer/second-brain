/**
 * Property Tests: Conversation Service - Message Persistence
 * 
 * Property 9: Message Persistence
 * For any message (user or assistant) processed by the chat service, after processing completes:
 * - The message SHALL be retrievable from the database
 * - The message SHALL have a valid conversationId referencing an existing conversation
 * - The message role SHALL match the sender (user or assistant)
 * 
 * **Validates: Requirements 7.1, 7.2, 7.4**
 */

import * as fc from 'fast-check';
import { getPrismaClient, disconnectPrisma } from '../../src/lib/prisma';
import {
  ConversationService,
  resetConversationService,
  Role,
} from '../../src/services/conversation.service';
import { Channel } from '../../src/types/entry.types';
import { TEST_USER_ID } from '../setup';

describe('Property Tests: Conversation Service', () => {
  let conversationService: ConversationService;
  const prisma = getPrismaClient();

  // Helper function to clean up test data in correct order
  async function cleanupTestData() {
    // Use a transaction to ensure proper cleanup order
    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({ where: { userId: TEST_USER_ID } });
      await tx.conversationSummary.deleteMany({ where: { userId: TEST_USER_ID } });
      await tx.conversation.deleteMany({ where: { userId: TEST_USER_ID } });
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    resetConversationService();
    conversationService = new ConversationService();

    // Clean up test data before each test
    await cleanupTestData();
  });

  afterAll(async () => {
    // Clean up all test data
    await cleanupTestData();
    await disconnectPrisma();
  });

  // ============================================
  // Arbitraries for generating test data
  // ============================================

  const channelArb = fc.constantFrom('chat', 'email', 'api') as fc.Arbitrary<Channel>;
  const roleArb = fc.constantFrom('user', 'assistant') as fc.Arbitrary<Role>;
  
  // Generate non-empty message content
  const messageContentArb = fc.string({ minLength: 1, maxLength: 500 })
    .filter(s => s.trim().length > 0);

  // Optional filed entry path (for assistant messages that file entries)
  const filedEntryPathArb = fc.option(
    fc.constantFrom(
      'people/john-doe.md',
      'projects/test-project.md',
      'ideas/new-idea.md',
      'admin/task-item.md',
      'inbox/unclear-item.md'
    ),
    { nil: undefined }
  );

  // Confidence score between 0 and 1
  const confidenceArb = fc.float({ min: 0, max: 1, noNaN: true });

  // ============================================
  // Property 9: Message Persistence
  // ============================================

  describe('Property 9: Message Persistence', () => {
    /**
     * Feature: chat-capture-and-classification, Property 9: Message Persistence
     * 
     * For any message (user or assistant) processed by the chat service:
     * - The message SHALL be retrievable from the database
     * - The message SHALL have a valid conversationId referencing an existing conversation
     * - The message role SHALL match the sender (user or assistant)
     */

    it('any message added to a conversation SHALL be retrievable from the database', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          roleArb,
          messageContentArb,
          async (channel, role, content) => {
            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add a message
            const createdMessage = await conversationService.addMessage(
              conversation.id,
              role,
              content
            );

            // Retrieve messages from the conversation
            const messages = await conversationService.getMessages(conversation.id);

            // Property: The message SHALL be retrievable from the database
            expect(messages.length).toBeGreaterThanOrEqual(1);
            const retrievedMessage = messages.find(m => m.id === createdMessage.id);
            expect(retrievedMessage).toBeDefined();
            expect(retrievedMessage!.content).toBe(content);
          }
        ),
        { numRuns: 3 } // Per steering guidelines: DB operations use 3-5 runs
      );
    });

    it('any message SHALL have a valid conversationId referencing an existing conversation', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          roleArb,
          messageContentArb,
          async (channel, role, content) => {
            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add a message
            const createdMessage = await conversationService.addMessage(
              conversation.id,
              role,
              content
            );

            // Property: The message SHALL have a valid conversationId
            expect(createdMessage.conversationId).toBe(conversation.id);

            // Verify the conversation exists
            const retrievedConversation = await conversationService.getById(
              createdMessage.conversationId
            );
            expect(retrievedConversation).not.toBeNull();
            expect(retrievedConversation!.id).toBe(conversation.id);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('the message role SHALL match the sender (user or assistant)', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          roleArb,
          messageContentArb,
          async (channel, role, content) => {
            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add a message with the specified role
            const createdMessage = await conversationService.addMessage(
              conversation.id,
              role,
              content
            );

            // Retrieve the message
            const messages = await conversationService.getMessages(conversation.id);
            const retrievedMessage = messages.find(m => m.id === createdMessage.id);

            // Property: The message role SHALL match the sender
            expect(retrievedMessage).toBeDefined();
            expect(retrievedMessage!.role).toBe(role);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('messages with filed entry metadata SHALL persist the path and confidence', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          messageContentArb,
          filedEntryPathArb,
          confidenceArb,
          async (channel, content, filedEntryPath, confidence) => {
            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add an assistant message with filed entry metadata
            const createdMessage = await conversationService.addMessage(
              conversation.id,
              'assistant',
              content,
              filedEntryPath,
              filedEntryPath ? confidence : undefined
            );

            // Retrieve the message
            const messages = await conversationService.getMessages(conversation.id);
            const retrievedMessage = messages.find(m => m.id === createdMessage.id);

            // Property: Filed entry metadata SHALL be persisted
            expect(retrievedMessage).toBeDefined();
            if (filedEntryPath) {
              expect(retrievedMessage!.filedEntryPath).toBe(filedEntryPath);
              expect(retrievedMessage!.filedConfidence).toBeCloseTo(confidence, 5);
            } else {
              expect(retrievedMessage!.filedEntryPath).toBeUndefined();
              expect(retrievedMessage!.filedConfidence).toBeUndefined();
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('multiple messages in a conversation SHALL all be retrievable', async () => {
      await fc.assert(
        fc.asyncProperty(
          channelArb,
          fc.array(
            fc.record({
              role: roleArb,
              content: messageContentArb,
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (channel, messageInputs) => {
            // Create a conversation
            const conversation = await conversationService.create(channel);

            // Add multiple messages
            const createdMessages = [];
            for (const input of messageInputs) {
              const msg = await conversationService.addMessage(
                conversation.id,
                input.role,
                input.content
              );
              createdMessages.push(msg);
            }

            // Retrieve all messages
            const retrievedMessages = await conversationService.getMessages(conversation.id);

            // Property: All messages SHALL be retrievable
            expect(retrievedMessages.length).toBe(createdMessages.length);

            // Verify each message is present with correct data
            for (const created of createdMessages) {
              const retrieved = retrievedMessages.find(m => m.id === created.id);
              expect(retrieved).toBeDefined();
              expect(retrieved!.conversationId).toBe(conversation.id);
              expect(retrieved!.role).toBe(created.role);
              expect(retrieved!.content).toBe(created.content);
            }
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

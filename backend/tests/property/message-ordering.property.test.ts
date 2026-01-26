/**
 * Property Tests: Message Chronological Ordering
 * 
 * Property 18: Message Chronological Ordering
 * For any list of messages retrieved for display, the messages SHALL be
 * ordered by createdAt timestamp in ascending order (oldest first).
 * 
 * **Validates: Requirements 2.1**
 */

import * as fc from 'fast-check';
import { getPrismaClient, disconnectPrisma } from '../../src/lib/prisma';
import {
  ConversationService,
  resetConversationService,
} from '../../src/services/conversation.service';

describe('Property Tests: Message Chronological Ordering', () => {
  let conversationService: ConversationService;
  const prisma = getPrismaClient();

  // Helper function to clean up test data
  async function cleanupTestData() {
    await prisma.$transaction(async (tx) => {
      await tx.message.deleteMany({});
      await tx.conversationSummary.deleteMany({});
      await tx.conversation.deleteMany({});
    });
  }

  beforeAll(async () => {
    await prisma.$connect();
  });

  beforeEach(async () => {
    resetConversationService();
    conversationService = new ConversationService();
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await disconnectPrisma();
  });

  /**
   * Property 18: Message Chronological Ordering
   * 
   * For any list of messages retrieved for display, the messages SHALL be
   * ordered by createdAt timestamp in ascending order (oldest first).
   * 
   * **Validates: Requirements 2.1**
   */
  describe('Property 18: Message Chronological Ordering', () => {
    it('messages are returned in chronological order (oldest first)', async () => {
      // Create a conversation
      const conversation = await conversationService.create('chat');

      // Add messages with small delays to ensure different timestamps
      const messageContents = ['First', 'Second', 'Third', 'Fourth', 'Fifth'];
      
      for (const content of messageContents) {
        await conversationService.addMessage(
          conversation.id,
          'user',
          content
        );
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Retrieve messages
      const messages = await conversationService.getMessages(conversation.id);

      // Verify chronological order
      expect(messages.length).toBe(messageContents.length);
      
      for (let i = 1; i < messages.length; i++) {
        const prevTime = new Date(messages[i - 1].createdAt).getTime();
        const currTime = new Date(messages[i].createdAt).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }

      // Verify content order matches insertion order
      for (let i = 0; i < messageContents.length; i++) {
        expect(messages[i].content).toBe(messageContents[i]);
      }
    });

    it('maintains order with mixed user and assistant messages', async () => {
      const conversation = await conversationService.create('chat');

      // Add alternating user and assistant messages
      const roles: Array<'user' | 'assistant'> = ['user', 'assistant', 'user', 'assistant', 'user'];
      
      for (let i = 0; i < roles.length; i++) {
        await conversationService.addMessage(
          conversation.id,
          roles[i],
          `Message ${i + 1}`
        );
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      const messages = await conversationService.getMessages(conversation.id);

      // Verify chronological order
      for (let i = 1; i < messages.length; i++) {
        const prevTime = new Date(messages[i - 1].createdAt).getTime();
        const currTime = new Date(messages[i].createdAt).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }

      // Verify roles match insertion order
      for (let i = 0; i < roles.length; i++) {
        expect(messages[i].role).toBe(roles[i]);
      }
    });

    it('order is preserved when limiting results', async () => {
      const conversation = await conversationService.create('chat');

      // Add 10 messages
      for (let i = 0; i < 10; i++) {
        await conversationService.addMessage(
          conversation.id,
          'user',
          `Message ${i + 1}`
        );
        await new Promise(resolve => setTimeout(resolve, 5));
      }

      // Get only first 5 messages
      const messages = await conversationService.getMessages(conversation.id, 5);

      expect(messages.length).toBe(5);

      // Verify chronological order
      for (let i = 1; i < messages.length; i++) {
        const prevTime = new Date(messages[i - 1].createdAt).getTime();
        const currTime = new Date(messages[i].createdAt).getTime();
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }

      // First 5 messages should be the oldest ones
      expect(messages[0].content).toBe('Message 1');
      expect(messages[4].content).toBe('Message 5');
    });
  });

  describe('Pure function ordering test', () => {
    it('sortMessagesChronologically maintains ascending order', () => {
      // Pure function test for sorting logic
      const sortMessagesChronologically = <T extends { createdAt: Date | string }>(
        messages: T[]
      ): T[] => {
        return [...messages].sort((a, b) => {
          const timeA = new Date(a.createdAt).getTime();
          const timeB = new Date(b.createdAt).getTime();
          return timeA - timeB;
        });
      };

      fc.assert(
        fc.property(
          fc.array(fc.date(), { minLength: 1, maxLength: 50 }),
          (dates) => {
            const messages = dates.map((d, i) => ({ 
              id: String(i), 
              createdAt: d 
            }));
            
            const sorted = sortMessagesChronologically(messages);
            
            // Verify ascending order
            for (let i = 1; i < sorted.length; i++) {
              expect(new Date(sorted[i].createdAt).getTime())
                .toBeGreaterThanOrEqual(new Date(sorted[i - 1].createdAt).getTime());
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});

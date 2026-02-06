/**
 * Unit tests for ConversationService
 * Tests message creation and retrieval, conversation creation for different channels,
 * and summary creation with valid message ranges.
 * 
 * Requirements: 7.1, 7.2, 7.4
 */

import { getPrismaClient, disconnectPrisma } from '../../../src/lib/prisma';
import {
  ConversationService,
  ConversationNotFoundError,
  resetConversationService,
} from '../../../src/services/conversation.service';
import { Channel } from '../../../src/types/entry.types';
import { TEST_USER_ID } from '../../setup';

describe('ConversationService', () => {
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
    // Ensure database connection
    await prisma.$connect();
  });

  beforeEach(async () => {
    // Reset singleton and create fresh instance
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
  // Conversation Creation Tests
  // ============================================

  describe('create', () => {
    it('should create a conversation for chat channel', async () => {
      const conversation = await conversationService.create('chat');

      expect(conversation).toBeDefined();
      expect(conversation.id).toBeDefined();
      expect(conversation.channel).toBe('chat');
      expect(conversation.createdAt).toBeInstanceOf(Date);
      expect(conversation.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a conversation for email channel', async () => {
      const conversation = await conversationService.create('email');

      expect(conversation).toBeDefined();
      expect(conversation.channel).toBe('email');
    });

    it('should create a conversation for api channel', async () => {
      const conversation = await conversationService.create('api');

      expect(conversation).toBeDefined();
      expect(conversation.channel).toBe('api');
    });

    it('should create a conversation with external ID', async () => {
      const externalId = 'external-thread-123';
      const conversation = await conversationService.create('email', externalId);

      expect(conversation.externalId).toBe(externalId);
    });

    it('should create multiple conversations independently', async () => {
      const conv1 = await conversationService.create('chat');
      const conv2 = await conversationService.create('chat');

      expect(conv1.id).not.toBe(conv2.id);
    });
  });

  // ============================================
  // Get Conversation by ID Tests
  // ============================================

  describe('getById', () => {
    it('should return conversation when found', async () => {
      const created = await conversationService.create('chat');
      const found = await conversationService.getById(created.id);

      expect(found).toBeDefined();
      expect(found!.id).toBe(created.id);
      expect(found!.channel).toBe('chat');
    });

    it('should return null when conversation not found', async () => {
      const found = await conversationService.getById('non-existent-id');

      expect(found).toBeNull();
    });

    it('should return null for invalid UUID format', async () => {
      const found = await conversationService.getById('invalid-uuid');

      expect(found).toBeNull();
    });
  });

  // ============================================
  // Get Most Recent Conversation Tests
  // ============================================

  describe('getMostRecent', () => {
    it('should return the most recent conversation for a channel', async () => {
      // Create conversations with slight delay to ensure different timestamps
      const conv1 = await conversationService.create('chat');
      await new Promise(resolve => setTimeout(resolve, 10));
      const conv2 = await conversationService.create('chat');

      const mostRecent = await conversationService.getMostRecent('chat');

      expect(mostRecent).toBeDefined();
      expect(mostRecent!.id).toBe(conv2.id);
    });

    it('should return null when no conversations exist for channel', async () => {
      await conversationService.create('chat');

      const mostRecent = await conversationService.getMostRecent('email');

      expect(mostRecent).toBeNull();
    });

    it('should return correct conversation for each channel', async () => {
      const chatConv = await conversationService.create('chat');
      const emailConv = await conversationService.create('email');
      const apiConv = await conversationService.create('api');

      const recentChat = await conversationService.getMostRecent('chat');
      const recentEmail = await conversationService.getMostRecent('email');
      const recentApi = await conversationService.getMostRecent('api');

      expect(recentChat!.id).toBe(chatConv.id);
      expect(recentEmail!.id).toBe(emailConv.id);
      expect(recentApi!.id).toBe(apiConv.id);
    });
  });

  // ============================================
  // Add Message Tests
  // ============================================

  describe('addMessage', () => {
    it('should add a user message to a conversation', async () => {
      const conversation = await conversationService.create('chat');
      const message = await conversationService.addMessage(
        conversation.id,
        'user',
        'Hello, this is a test message'
      );

      expect(message).toBeDefined();
      expect(message.id).toBeDefined();
      expect(message.conversationId).toBe(conversation.id);
      expect(message.role).toBe('user');
      expect(message.content).toBe('Hello, this is a test message');
      expect(message.createdAt).toBeInstanceOf(Date);
    });

    it('should add an assistant message to a conversation', async () => {
      const conversation = await conversationService.create('chat');
      const message = await conversationService.addMessage(
        conversation.id,
        'assistant',
        'I understand your request'
      );

      expect(message.role).toBe('assistant');
      expect(message.content).toBe('I understand your request');
    });

    it('should add a message with filed entry path and confidence', async () => {
      const conversation = await conversationService.create('chat');
      const message = await conversationService.addMessage(
        conversation.id,
        'assistant',
        'I filed this as a project',
        'projects/test-project',
        0.85
      );

      expect(message.filedEntryPath).toBe('projects/test-project');
      expect(message.filedConfidence).toBe(0.85);
    });

    it('should throw ConversationNotFoundError for non-existent conversation', async () => {
      await expect(
        conversationService.addMessage(
          'non-existent-id',
          'user',
          'Test message'
        )
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('should update conversation updatedAt timestamp when adding message', async () => {
      const conversation = await conversationService.create('chat');
      const originalUpdatedAt = conversation.updatedAt;

      await new Promise(resolve => setTimeout(resolve, 10));
      await conversationService.addMessage(conversation.id, 'user', 'Test');

      const updated = await conversationService.getById(conversation.id);
      expect(updated!.updatedAt.getTime()).toBeGreaterThan(originalUpdatedAt.getTime());
    });
  });

  // ============================================
  // Get Messages Tests
  // ============================================

  describe('getMessages', () => {
    it('should return messages in chronological order', async () => {
      const conversation = await conversationService.create('chat');
      
      await conversationService.addMessage(conversation.id, 'user', 'First message');
      await new Promise(resolve => setTimeout(resolve, 5));
      await conversationService.addMessage(conversation.id, 'assistant', 'Second message');
      await new Promise(resolve => setTimeout(resolve, 5));
      await conversationService.addMessage(conversation.id, 'user', 'Third message');

      const messages = await conversationService.getMessages(conversation.id);

      expect(messages).toHaveLength(3);
      expect(messages[0].content).toBe('First message');
      expect(messages[1].content).toBe('Second message');
      expect(messages[2].content).toBe('Third message');
    });

    it('should return empty array for conversation with no messages', async () => {
      const conversation = await conversationService.create('chat');

      const messages = await conversationService.getMessages(conversation.id);

      expect(messages).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      const conversation = await conversationService.create('chat');
      
      for (let i = 1; i <= 5; i++) {
        await conversationService.addMessage(conversation.id, 'user', `Message ${i}`);
      }

      const messages = await conversationService.getMessages(conversation.id, 3);

      expect(messages).toHaveLength(3);
      // Should return first 3 messages (oldest first due to chronological order)
      expect(messages[0].content).toBe('Message 1');
      expect(messages[2].content).toBe('Message 3');
    });

    it('should return all messages when limit exceeds message count', async () => {
      const conversation = await conversationService.create('chat');
      
      await conversationService.addMessage(conversation.id, 'user', 'Only message');

      const messages = await conversationService.getMessages(conversation.id, 100);

      expect(messages).toHaveLength(1);
    });
  });

  // ============================================
  // Get Message Count Tests
  // ============================================

  describe('getMessageCount', () => {
    it('should return correct message count', async () => {
      const conversation = await conversationService.create('chat');
      
      await conversationService.addMessage(conversation.id, 'user', 'Message 1');
      await conversationService.addMessage(conversation.id, 'assistant', 'Message 2');
      await conversationService.addMessage(conversation.id, 'user', 'Message 3');

      const count = await conversationService.getMessageCount(conversation.id);

      expect(count).toBe(3);
    });

    it('should return 0 for conversation with no messages', async () => {
      const conversation = await conversationService.create('chat');

      const count = await conversationService.getMessageCount(conversation.id);

      expect(count).toBe(0);
    });

    it('should return 0 for non-existent conversation', async () => {
      const count = await conversationService.getMessageCount('non-existent-id');

      expect(count).toBe(0);
    });
  });

  // ============================================
  // Summary Tests
  // ============================================

  describe('addSummary', () => {
    it('should add a summary with valid message range', async () => {
      const conversation = await conversationService.create('chat');
      const msg1 = await conversationService.addMessage(conversation.id, 'user', 'First');
      const msg2 = await conversationService.addMessage(conversation.id, 'assistant', 'Second');
      const msg3 = await conversationService.addMessage(conversation.id, 'user', 'Third');

      const summary = await conversationService.addSummary(
        conversation.id,
        'Summary of the conversation about testing',
        3,
        msg1.id,
        msg3.id
      );

      expect(summary).toBeDefined();
      expect(summary.id).toBeDefined();
      expect(summary.conversationId).toBe(conversation.id);
      expect(summary.summary).toBe('Summary of the conversation about testing');
      expect(summary.messageCount).toBe(3);
      expect(summary.startMessageId).toBe(msg1.id);
      expect(summary.endMessageId).toBe(msg3.id);
      expect(summary.createdAt).toBeInstanceOf(Date);
    });

    it('should throw ConversationNotFoundError for non-existent conversation', async () => {
      await expect(
        conversationService.addSummary(
          'non-existent-id',
          'Test summary',
          5,
          'start-id',
          'end-id'
        )
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('should allow multiple summaries for the same conversation', async () => {
      const conversation = await conversationService.create('chat');
      const msg1 = await conversationService.addMessage(conversation.id, 'user', 'First');
      const msg2 = await conversationService.addMessage(conversation.id, 'assistant', 'Second');

      const summary1 = await conversationService.addSummary(
        conversation.id,
        'First summary',
        1,
        msg1.id,
        msg1.id
      );

      const summary2 = await conversationService.addSummary(
        conversation.id,
        'Second summary',
        1,
        msg2.id,
        msg2.id
      );

      expect(summary1.id).not.toBe(summary2.id);
    });
  });

  describe('getSummaries', () => {
    it('should return summaries in chronological order', async () => {
      const conversation = await conversationService.create('chat');
      const msg1 = await conversationService.addMessage(conversation.id, 'user', 'First');
      const msg2 = await conversationService.addMessage(conversation.id, 'assistant', 'Second');

      await conversationService.addSummary(
        conversation.id,
        'First summary',
        1,
        msg1.id,
        msg1.id
      );

      await new Promise(resolve => setTimeout(resolve, 10));

      await conversationService.addSummary(
        conversation.id,
        'Second summary',
        1,
        msg2.id,
        msg2.id
      );

      const summaries = await conversationService.getSummaries(conversation.id);

      expect(summaries).toHaveLength(2);
      expect(summaries[0].summary).toBe('First summary');
      expect(summaries[1].summary).toBe('Second summary');
    });

    it('should return empty array for conversation with no summaries', async () => {
      const conversation = await conversationService.create('chat');

      const summaries = await conversationService.getSummaries(conversation.id);

      expect(summaries).toEqual([]);
    });

    it('should return empty array for non-existent conversation', async () => {
      const summaries = await conversationService.getSummaries('non-existent-id');

      expect(summaries).toEqual([]);
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================

  describe('error handling', () => {
    it('should throw ConversationNotFoundError with correct message', async () => {
      const testId = 'test-conversation-id';

      try {
        await conversationService.addMessage(testId, 'user', 'Test');
        fail('Expected ConversationNotFoundError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ConversationNotFoundError);
        expect((error as ConversationNotFoundError).message).toContain(testId);
      }
    });

    it('should handle adding message to deleted conversation', async () => {
      const conversation = await conversationService.create('chat');
      
      // Delete the conversation directly via Prisma
      await prisma.conversation.delete({ where: { id: conversation.id } });

      await expect(
        conversationService.addMessage(conversation.id, 'user', 'Test')
      ).rejects.toThrow(ConversationNotFoundError);
    });

    it('should handle adding summary to deleted conversation', async () => {
      const conversation = await conversationService.create('chat');
      
      // Delete the conversation directly via Prisma
      await prisma.conversation.delete({ where: { id: conversation.id } });

      await expect(
        conversationService.addSummary(
          conversation.id,
          'Test summary',
          1,
          'start-id',
          'end-id'
        )
      ).rejects.toThrow(ConversationNotFoundError);
    });
  });
});

/**
 * Integration Tests for Chat API
 * Tests the full flow from POST /api/chat to entry creation.
 * 
 * Requirements: 12.1, 12.2, 12.3, 12.4
 */

import request from 'supertest';
import express from 'express';
import { getPrismaClient, disconnectPrisma } from '../../src/lib/prisma';
import { authMiddleware } from '../../src/middleware/auth';
import { chatRouter } from '../../src/routes/chat';
import { resetConversationService } from '../../src/services/conversation.service';
import { resetChatService } from '../../src/services/chat.service';
import { resetContextAssembler } from '../../src/services/context.service';
import { resetSummarizationService } from '../../src/services/summarization.service';
import { resetDatabase, TEST_USER_ID } from '../setup';

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  
  // Use a mock auth middleware for testing
  app.use('/api/chat', (req, res, next) => {
    // Skip auth for tests
    next();
  }, chatRouter);
  
  return app;
};

describe('Chat API Integration Tests', () => {
  const prisma = getPrismaClient();
  let app: express.Application;

  beforeAll(async () => {
    await prisma.$connect();
    app = createTestApp();
  });

  beforeEach(async () => {
    // Reset all service singletons
    resetConversationService();
    resetChatService();
    resetContextAssembler();
    resetSummarizationService();
    
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
    await disconnectPrisma();
  });

  describe('POST /api/chat', () => {
    it('returns 400 for missing message', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for empty message', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: '' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for whitespace-only message', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    // Note: Full chat processing tests require OpenAI API mocking
    // which is complex. The service-level tests cover the core logic.
  });

  describe('GET /api/chat/conversations', () => {
    it('returns empty array when no conversations exist', async () => {
      const response = await request(app)
        .get('/api/chat/conversations');

      expect(response.status).toBe(200);
      expect(response.body.conversations).toEqual([]);
    });

    it('returns conversations with message counts', async () => {
      // Create a conversation directly in the database
      const conversation = await prisma.conversation.create({
        data: {
          userId: TEST_USER_ID,
          channel: 'chat',
        },
      });

      // Add some messages
      await prisma.message.createMany({
        data: [
          { conversationId: conversation.id, userId: TEST_USER_ID, role: 'user', content: 'Hello' },
          { conversationId: conversation.id, userId: TEST_USER_ID, role: 'assistant', content: 'Hi there!' },
        ],
      });

      const response = await request(app)
        .get('/api/chat/conversations');

      expect(response.status).toBe(200);
      expect(response.body.conversations).toHaveLength(1);
      expect(response.body.conversations[0].id).toBe(conversation.id);
      expect(response.body.conversations[0].channel).toBe('chat');
      expect(response.body.conversations[0].messageCount).toBe(2);
    });

    it('supports pagination with limit and offset', async () => {
      // Create multiple conversations
      await prisma.conversation.createMany({
        data: [
          { userId: TEST_USER_ID, channel: 'chat' },
          { userId: TEST_USER_ID, channel: 'chat' },
          { userId: TEST_USER_ID, channel: 'chat' },
        ],
      });

      const response = await request(app)
        .get('/api/chat/conversations')
        .query({ limit: 2, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.conversations.length).toBeLessThanOrEqual(2);
    });
  });

  describe('GET /api/chat/conversations/:id/messages', () => {
    it('returns 404 for non-existent conversation', async () => {
      const response = await request(app)
        .get('/api/chat/conversations/non-existent-id/messages');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('returns messages for existing conversation', async () => {
      // Create a conversation with messages
      const conversation = await prisma.conversation.create({
        data: {
          userId: TEST_USER_ID,
          channel: 'chat',
        },
      });

      await prisma.message.createMany({
        data: [
          { conversationId: conversation.id, userId: TEST_USER_ID, role: 'user', content: 'Hello' },
          { conversationId: conversation.id, userId: TEST_USER_ID, role: 'assistant', content: 'Hi there!' },
        ],
      });

      const response = await request(app)
        .get(`/api/chat/conversations/${conversation.id}/messages`);

      expect(response.status).toBe(200);
      expect(response.body.messages).toHaveLength(2);
      expect(response.body.messages[0].role).toBe('user');
      expect(response.body.messages[0].content).toBe('Hello');
      expect(response.body.messages[1].role).toBe('assistant');
      expect(response.body.messages[1].content).toBe('Hi there!');
    });

    it('includes filed entry metadata in messages', async () => {
      const conversation = await prisma.conversation.create({
        data: {
          userId: TEST_USER_ID,
          channel: 'chat',
        },
      });

      await prisma.message.create({
        data: {
          userId: TEST_USER_ID,
          conversationId: conversation.id,
          role: 'assistant',
          content: 'Filed your entry',
          filedEntryPath: 'projects/test-project',
          filedConfidence: 0.85,
        },
      });

      const response = await request(app)
        .get(`/api/chat/conversations/${conversation.id}/messages`);

      expect(response.status).toBe(200);
      expect(response.body.messages[0].filedEntryPath).toBe('projects/test-project');
      expect(response.body.messages[0].filedConfidence).toBe(0.85);
    });
  });

  describe('GET /api/chat/conversations/:id', () => {
    it('returns 404 for non-existent conversation', async () => {
      const response = await request(app)
        .get('/api/chat/conversations/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('returns conversation details with message count', async () => {
      const conversation = await prisma.conversation.create({
        data: {
          userId: TEST_USER_ID,
          channel: 'email',
        },
      });

      await prisma.message.createMany({
        data: [
          { conversationId: conversation.id, userId: TEST_USER_ID, role: 'user', content: 'Test 1' },
          { conversationId: conversation.id, userId: TEST_USER_ID, role: 'assistant', content: 'Test 2' },
          { conversationId: conversation.id, userId: TEST_USER_ID, role: 'user', content: 'Test 3' },
        ],
      });

      const response = await request(app)
        .get(`/api/chat/conversations/${conversation.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(conversation.id);
      expect(response.body.channel).toBe('email');
      expect(response.body.messageCount).toBe(3);
    });
  });
});

/**
 * Unit tests for ThreadTracker database operations
 * Tests createThread(), findConversation(), and getByMessageId() methods.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import {
  ThreadTracker,
  CreateThreadParams,
  EmailThread,
  resetThreadTracker,
} from '../../../src/services/thread-tracker';
import { TEST_USER_ID } from '../../setup';

// Mock the Prisma client
jest.mock('../../../src/lib/prisma', () => {
  const mockEmailThread = {
    create: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
  };

  return {
    getPrismaClient: jest.fn(() => ({
      emailThread: mockEmailThread,
    })),
  };
});

import { getPrismaClient } from '../../../src/lib/prisma';

describe('ThreadTracker - Database Operations', () => {
  let tracker: ThreadTracker;
  let mockPrisma: ReturnType<typeof getPrismaClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    resetThreadTracker();
    tracker = new ThreadTracker();
    mockPrisma = getPrismaClient();
  });

  // ============================================
  // createThread() Tests
  // ============================================

  describe('createThread', () => {
    // Requirement 4.1: Create EmailThread record with Message-ID header
    // Requirement 4.2: Store threadId linking related emails
    // Requirement 4.3: Store In-Reply-To header for threading
    // Requirement 4.4: Store subject, sender address, and conversationId

    it('should store all required fields when creating a thread', async () => {
      const params: CreateThreadParams = {
        messageId: '<test123@example.com>',
        threadId: 'a1b2c3d4',
        subject: 'Test Subject',
        fromAddress: 'sender@example.com',
        conversationId: 'conv-uuid-123',
      };

      const mockCreatedThread = {
        id: 'thread-uuid-1',
        messageId: params.messageId,
        threadId: params.threadId,
        inReplyTo: null,
        subject: params.subject,
        fromAddress: params.fromAddress,
        conversationId: params.conversationId,
        createdAt: new Date('2024-01-15T10:00:00Z'),
      };

      (mockPrisma.emailThread.create as jest.Mock).mockResolvedValue(mockCreatedThread);

      const result = await tracker.createThread(params);

      // Verify Prisma was called with correct data
      expect(mockPrisma.emailThread.create).toHaveBeenCalledWith({
        data: {
          userId: TEST_USER_ID,
          messageId: params.messageId,
          threadId: params.threadId,
          inReplyTo: undefined,
          subject: params.subject,
          fromAddress: params.fromAddress,
          conversationId: params.conversationId,
        },
      });

      // Verify returned EmailThread has correct fields
      expect(result.id).toBe('thread-uuid-1');
      expect(result.messageId).toBe(params.messageId);
      expect(result.threadId).toBe(params.threadId);
      expect(result.subject).toBe(params.subject);
      expect(result.fromAddress).toBe(params.fromAddress);
      expect(result.conversationId).toBe(params.conversationId);
      expect(result.createdAt).toEqual(new Date('2024-01-15T10:00:00Z'));
    });

    it('should store In-Reply-To header when provided (Requirement 4.3)', async () => {
      const params: CreateThreadParams = {
        messageId: '<reply456@example.com>',
        threadId: 'e5f60718',
        inReplyTo: '<original123@example.com>',
        subject: 'Re: Original Subject',
        fromAddress: 'replier@example.com',
        conversationId: 'conv-uuid-456',
      };

      const mockCreatedThread = {
        id: 'thread-uuid-2',
        messageId: params.messageId,
        threadId: params.threadId,
        inReplyTo: params.inReplyTo,
        subject: params.subject,
        fromAddress: params.fromAddress,
        conversationId: params.conversationId,
        createdAt: new Date('2024-01-15T11:00:00Z'),
      };

      (mockPrisma.emailThread.create as jest.Mock).mockResolvedValue(mockCreatedThread);

      const result = await tracker.createThread(params);

      // Verify In-Reply-To was passed to Prisma
      expect(mockPrisma.emailThread.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: TEST_USER_ID,
          inReplyTo: '<original123@example.com>',
        }),
      });

      // Verify returned EmailThread has inReplyTo
      expect(result.inReplyTo).toBe('<original123@example.com>');
    });

    it('should handle inReplyTo as undefined when not provided', async () => {
      const params: CreateThreadParams = {
        messageId: '<new789@example.com>',
        threadId: 'f7g8h9i0',
        subject: 'New Thread',
        fromAddress: 'new@example.com',
        conversationId: 'conv-uuid-789',
      };

      const mockCreatedThread = {
        id: 'thread-uuid-3',
        messageId: params.messageId,
        threadId: params.threadId,
        inReplyTo: null,
        subject: params.subject,
        fromAddress: params.fromAddress,
        conversationId: params.conversationId,
        createdAt: new Date(),
      };

      (mockPrisma.emailThread.create as jest.Mock).mockResolvedValue(mockCreatedThread);

      const result = await tracker.createThread(params);

      // inReplyTo should be undefined (mapped from null)
      expect(result.inReplyTo).toBeUndefined();
    });

    it('should return EmailThread with createdAt timestamp', async () => {
      const params: CreateThreadParams = {
        messageId: '<timestamp@example.com>',
        threadId: 'abcd1234',
        subject: 'Timestamp Test',
        fromAddress: 'test@example.com',
        conversationId: 'conv-uuid-ts',
      };

      const expectedDate = new Date('2024-06-15T14:30:00Z');
      const mockCreatedThread = {
        id: 'thread-uuid-ts',
        messageId: params.messageId,
        threadId: params.threadId,
        inReplyTo: null,
        subject: params.subject,
        fromAddress: params.fromAddress,
        conversationId: params.conversationId,
        createdAt: expectedDate,
      };

      (mockPrisma.emailThread.create as jest.Mock).mockResolvedValue(mockCreatedThread);

      const result = await tracker.createThread(params);

      expect(result.createdAt).toEqual(expectedDate);
      expect(result.createdAt).toBeInstanceOf(Date);
    });
  });

  // ============================================
  // findConversation() Tests
  // ============================================

  describe('findConversation', () => {
    // Requirement 4.5: Query by threadId to find related messages

    it('should return conversationId when thread is found', async () => {
      const threadId = 'a1b2c3d4';
      const expectedConversationId = 'conv-uuid-found';

      (mockPrisma.emailThread.findFirst as jest.Mock).mockResolvedValue({
        id: 'thread-uuid-1',
        messageId: '<test@example.com>',
        threadId: threadId,
        inReplyTo: null,
        subject: 'Test',
        fromAddress: 'test@example.com',
        conversationId: expectedConversationId,
        createdAt: new Date(),
      });

      const result = await tracker.findConversation(threadId);

      expect(result).toBe(expectedConversationId);
      expect(mockPrisma.emailThread.findFirst).toHaveBeenCalledWith({
        where: { threadId, userId: TEST_USER_ID },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return null when thread is not found', async () => {
      const threadId = 'nonexistent';

      (mockPrisma.emailThread.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await tracker.findConversation(threadId);

      expect(result).toBeNull();
      expect(mockPrisma.emailThread.findFirst).toHaveBeenCalledWith({
        where: { threadId: 'nonexistent', userId: TEST_USER_ID },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should query with orderBy createdAt desc to get most recent', async () => {
      const threadId = 'multi1234';

      (mockPrisma.emailThread.findFirst as jest.Mock).mockResolvedValue({
        id: 'thread-uuid-latest',
        messageId: '<latest@example.com>',
        threadId: threadId,
        inReplyTo: '<earlier@example.com>',
        subject: 'Re: Re: Original',
        fromAddress: 'user@example.com',
        conversationId: 'conv-uuid-multi',
        createdAt: new Date('2024-01-15T15:00:00Z'),
      });

      await tracker.findConversation(threadId);

      // Verify the query orders by createdAt descending
      expect(mockPrisma.emailThread.findFirst).toHaveBeenCalledWith({
        where: { threadId, userId: TEST_USER_ID },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should handle empty threadId', async () => {
      (mockPrisma.emailThread.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await tracker.findConversation('');

      expect(result).toBeNull();
      expect(mockPrisma.emailThread.findFirst).toHaveBeenCalledWith({
        where: { threadId: '', userId: TEST_USER_ID },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  // ============================================
  // getByMessageId() Tests
  // ============================================

  describe('getByMessageId', () => {
    // Requirement 7.5: Not process the same email twice (track by Message-ID)

    it('should return EmailThread when message is found (duplicate detection)', async () => {
      const messageId = '<existing@example.com>';

      const mockThread = {
        id: 'thread-uuid-existing',
        messageId: messageId,
        threadId: 'exist123',
        inReplyTo: null,
        subject: 'Existing Email',
        fromAddress: 'sender@example.com',
        conversationId: 'conv-uuid-existing',
        createdAt: new Date('2024-01-10T09:00:00Z'),
      };

      (mockPrisma.emailThread.findFirst as jest.Mock).mockResolvedValue(mockThread);

      const result = await tracker.getByMessageId(messageId);

      expect(result).not.toBeNull();
      expect(result!.id).toBe('thread-uuid-existing');
      expect(result!.messageId).toBe(messageId);
      expect(result!.threadId).toBe('exist123');
      expect(result!.subject).toBe('Existing Email');
      expect(result!.fromAddress).toBe('sender@example.com');
      expect(result!.conversationId).toBe('conv-uuid-existing');
      expect(mockPrisma.emailThread.findFirst).toHaveBeenCalledWith({
        where: { messageId, userId: TEST_USER_ID },
      });
    });

    it('should return null when message is not found (new email)', async () => {
      const messageId = '<new-email@example.com>';

      (mockPrisma.emailThread.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await tracker.getByMessageId(messageId);

      expect(result).toBeNull();
      expect(mockPrisma.emailThread.findFirst).toHaveBeenCalledWith({
        where: { messageId: '<new-email@example.com>', userId: TEST_USER_ID },
      });
    });

    it('should correctly map inReplyTo from null to undefined', async () => {
      const messageId = '<no-reply-to@example.com>';

      const mockThread = {
        id: 'thread-uuid-noreply',
        messageId: messageId,
        threadId: 'noreply1',
        inReplyTo: null,
        subject: 'No Reply-To',
        fromAddress: 'sender@example.com',
        conversationId: 'conv-uuid-noreply',
        createdAt: new Date(),
      };

      (mockPrisma.emailThread.findFirst as jest.Mock).mockResolvedValue(mockThread);

      const result = await tracker.getByMessageId(messageId);

      expect(result).not.toBeNull();
      expect(result!.inReplyTo).toBeUndefined();
    });

    it('should preserve inReplyTo when present', async () => {
      const messageId = '<with-reply-to@example.com>';
      const inReplyTo = '<parent@example.com>';

      const mockThread = {
        id: 'thread-uuid-withreply',
        messageId: messageId,
        threadId: 'reply123',
        inReplyTo: inReplyTo,
        subject: 'Re: Parent Email',
        fromAddress: 'replier@example.com',
        conversationId: 'conv-uuid-withreply',
        createdAt: new Date(),
      };

      (mockPrisma.emailThread.findFirst as jest.Mock).mockResolvedValue(mockThread);

      const result = await tracker.getByMessageId(messageId);

      expect(result).not.toBeNull();
      expect(result!.inReplyTo).toBe(inReplyTo);
    });

    it('should query by messageId scoped to user', async () => {
      const messageId = '<unique-lookup@example.com>';

      (mockPrisma.emailThread.findFirst as jest.Mock).mockResolvedValue(null);

      await tracker.getByMessageId(messageId);

      expect(mockPrisma.emailThread.findFirst).toHaveBeenCalledTimes(1);
      expect(mockPrisma.emailThread.findFirst).toHaveBeenCalledWith({
        where: { messageId, userId: TEST_USER_ID },
      });
    });
  });

  // ============================================
  // Integration of Database Operations
  // ============================================

  describe('database operation integration', () => {
    it('should allow finding a conversation after creating a thread', async () => {
      const params: CreateThreadParams = {
        messageId: '<integration@example.com>',
        threadId: 'integ123',
        subject: 'Integration Test',
        fromAddress: 'test@example.com',
        conversationId: 'conv-integration',
      };

      // Mock create
      (mockPrisma.emailThread.create as jest.Mock).mockResolvedValue({
        id: 'thread-integration',
        ...params,
        inReplyTo: null,
        createdAt: new Date(),
      });

      // Mock findFirst to return the created thread
      (mockPrisma.emailThread.findFirst as jest.Mock).mockResolvedValue({
        id: 'thread-integration',
        ...params,
        inReplyTo: null,
        createdAt: new Date(),
      });

      // Create the thread
      await tracker.createThread(params);

      // Find the conversation
      const conversationId = await tracker.findConversation(params.threadId);

      expect(conversationId).toBe('conv-integration');
    });

    it('should detect duplicate by messageId after creating a thread', async () => {
      const params: CreateThreadParams = {
        messageId: '<duplicate-check@example.com>',
        threadId: 'dup12345',
        subject: 'Duplicate Check',
        fromAddress: 'sender@example.com',
        conversationId: 'conv-duplicate',
      };

      const mockThread = {
        id: 'thread-duplicate',
        ...params,
        inReplyTo: null,
        createdAt: new Date(),
      };

      // Mock create
      (mockPrisma.emailThread.create as jest.Mock).mockResolvedValue(mockThread);

      // Mock findFirst to return the created thread
      (mockPrisma.emailThread.findFirst as jest.Mock).mockResolvedValue(mockThread);

      // Create the thread
      await tracker.createThread(params);

      // Check for duplicate
      const existingThread = await tracker.getByMessageId(params.messageId);

      expect(existingThread).not.toBeNull();
      expect(existingThread!.messageId).toBe(params.messageId);
    });
  });
});

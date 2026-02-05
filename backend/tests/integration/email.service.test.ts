/**
 * Integration tests for EmailService
 * Tests processInboundEmail() with mocked dependencies
 * Tests course correction flow via email reply
 * 
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { Category } from '../../src/types/entry.types';

// Define mock functions before jest.mock calls
const mockCreateThread = jest.fn();
const mockFindConversation = jest.fn();
const mockGetByMessageId = jest.fn();
const mockFindByThreadId = jest.fn();
const mockProcessMessage = jest.fn();
const mockSendConfirmation = jest.fn();
const mockSmtpSendReply = jest.fn();
const mockImapStart = jest.fn();
const mockImapStop = jest.fn();
const mockImapSetProcessor = jest.fn();
const mockExtractText = jest.fn();
const mockExtractHint = jest.fn();
const mockExtractThreadId = jest.fn();

// Mock all dependencies
jest.mock('../../src/config/email', () => ({
  getEmailConfig: jest.fn().mockReturnValue({
    smtp: { host: 'smtp.test.com', port: 587, user: 'test@test.com', pass: 'pass', secure: false },
    imap: { host: 'imap.test.com', user: 'test@test.com', pass: 'pass', port: 993, tls: true },
    pollInterval: 60,
    enabled: true,
  }),
  resetEmailConfig: jest.fn(),
}));

jest.mock('../../src/services/email-parser', () => ({
  getEmailParser: jest.fn().mockImplementation(() => ({
    parse: jest.fn(),
    extractText: mockExtractText,
    extractHint: mockExtractHint,
    extractThreadId: mockExtractThreadId,
  })),
}));

jest.mock('../../src/services/thread-tracker', () => ({
  getThreadTracker: jest.fn().mockImplementation(() => ({
    generateThreadId: jest.fn().mockReturnValue('a1b2c3d4'),
    formatThreadId: jest.fn((id: string) => `[SB-${id}]`),
    createThread: mockCreateThread,
    findConversation: mockFindConversation,
    getByMessageId: mockGetByMessageId,
    findByThreadId: mockFindByThreadId,
  })),
  resetThreadTracker: jest.fn(),
}));

jest.mock('../../src/services/smtp-sender', () => ({
  getSmtpSender: jest.fn().mockImplementation(() => ({
    isAvailable: jest.fn().mockReturnValue(true),
    sendEmail: jest.fn().mockResolvedValue({ success: true, messageId: '<sent@test.com>' }),
    sendReply: mockSmtpSendReply,
  })),
  resetSmtpSender: jest.fn(),
}));

jest.mock('../../src/services/confirmation-sender', () => ({
  getConfirmationSender: jest.fn().mockImplementation(() => ({
    isAvailable: jest.fn().mockReturnValue(true),
    formatConfirmationEmail: jest.fn().mockReturnValue({
      subject: 'Re: Test [SB-a1b2c3d4]',
      body: 'Confirmation body',
    }),
    sendConfirmation: mockSendConfirmation,
  })),
  resetConfirmationSender: jest.fn(),
}));

jest.mock('../../src/services/imap-poller', () => ({
  getImapPoller: jest.fn().mockImplementation(() => ({
    start: mockImapStart,
    stop: mockImapStop,
    isRunning: jest.fn().mockReturnValue(false),
    pollNow: jest.fn().mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: [] }),
    setProcessor: mockImapSetProcessor,
  })),
  resetImapPoller: jest.fn(),
}));

jest.mock('../../src/services/chat.service', () => ({
  getChatService: jest.fn().mockImplementation(() => ({
    processMessage: mockProcessMessage,
  })),
  resetChatService: jest.fn(),
}));

import {
  EmailService,
  resetEmailService,
} from '../../src/services/email.service';
import { ParsedEmail } from '../../src/services/email-parser';

describe('EmailService Integration', () => {
  let emailService: EmailService;

  beforeEach(() => {
    jest.clearAllMocks();
    resetEmailService();
    
    // Set up default mock implementations
    mockExtractText.mockReturnValue('Test message content');
    mockExtractHint.mockReturnValue(null);
    mockExtractThreadId.mockReturnValue(null);
    mockGetByMessageId.mockResolvedValue(null);
    mockFindConversation.mockResolvedValue(null);
    mockFindByThreadId.mockResolvedValue(null);
    mockSmtpSendReply.mockResolvedValue({ success: true, messageId: '<reply@test.com>' });
    mockSendConfirmation.mockResolvedValue({ success: true, messageId: '<conf@test.com>' });
    mockCreateThread.mockResolvedValue({
      id: 'thread-1',
      messageId: '<test@example.com>',
      threadId: 'a1b2c3d4',
      subject: 'Test Subject',
      fromAddress: 'sender@example.com',
      conversationId: 'conv-1',
      createdAt: new Date(),
    });
    mockProcessMessage.mockResolvedValue({
      conversationId: 'conv-1',
      message: {
        id: 'msg-1',
        role: 'assistant',
        content: 'Got it!',
        createdAt: new Date(),
      },
      entry: {
        path: 'ideas/test-idea.md',
        category: 'ideas' as Category,
        name: 'Test Idea',
        confidence: 0.85,
      },
      clarificationNeeded: false,
    });
    
    emailService = new EmailService();
  });

  afterEach(() => {
    resetEmailService();
  });

  describe('isEnabled()', () => {
    it('should return true when email is configured', () => {
      expect(emailService.isEnabled()).toBe(true);
    });
  });

  describe('processInboundEmail()', () => {
    const createTestEmail = (overrides?: Partial<ParsedEmail>): ParsedEmail => ({
      messageId: '<test-123@example.com>',
      from: { address: 'sender@example.com', name: 'Test Sender' },
      to: [{ address: 'brain@example.com' }],
      subject: 'Test Subject',
      text: 'Test message content',
      date: new Date('2024-01-15T10:00:00Z'),
      ...overrides,
    });

    it('should process a new email and create entry', async () => {
      const email = createTestEmail();
      
      const result = await emailService.processInboundEmail(email);
      
      expect(result.success).toBe(true);
      expect(result.conversationId).toBe('conv-1');
      expect(result.entryPath).toBe('ideas/test-idea.md');
      expect(result.threadId).toBe('a1b2c3d4');
    });

    it('should call ChatService.processMessage with extracted text', async () => {
      const email = createTestEmail();
      
      await emailService.processInboundEmail(email);
      
      expect(mockProcessMessage).toHaveBeenCalledWith(
        null,
        'Test message content',
        undefined,
        'email'
      );
    });

    it('should create thread record after processing', async () => {
      const email = createTestEmail();
      
      await emailService.processInboundEmail(email);
      
      expect(mockCreateThread).toHaveBeenCalledWith({
        messageId: '<test-123@example.com>',
        threadId: 'a1b2c3d4',
        inReplyTo: undefined,
        subject: 'Test Subject',
        fromAddress: 'sender@example.com',
        conversationId: 'conv-1',
      });
    });

    it('should send confirmation email after processing', async () => {
      const email = createTestEmail();
      
      await emailService.processInboundEmail(email);
      
      expect(mockSendConfirmation).toHaveBeenCalledWith({
        to: 'sender@example.com',
        originalSubject: 'Test Subject',
        originalMessageId: '<test-123@example.com>',
        threadId: 'a1b2c3d4',
        entry: {
          name: 'Test Idea',
          category: 'ideas',
          confidence: 0.85,
        },
      });
    });

    it('should skip duplicate emails', async () => {
      mockGetByMessageId.mockResolvedValueOnce({
        id: 'existing-thread',
        messageId: '<test-123@example.com>',
        threadId: 'existing-id',
        conversationId: 'existing-conv',
      });
      
      const email = createTestEmail();
      const result = await emailService.processInboundEmail(email);
      
      expect(result.success).toBe(true);
      expect(result.threadId).toBe('existing-id');
      expect(mockProcessMessage).not.toHaveBeenCalled();
    });

    it('should link to existing conversation when thread ID found', async () => {
      mockExtractThreadId.mockReturnValueOnce('existing-thread');
      mockFindConversation.mockResolvedValueOnce('existing-conv-id');
      
      const email = createTestEmail({
        subject: 'Re: Original Subject [SB-existing-thread]',
      });
      
      await emailService.processInboundEmail(email);
      
      expect(mockProcessMessage).toHaveBeenCalledWith(
        'existing-conv-id',
        'Test message content',
        undefined,
        'email'
      );
    });

    it('should extract and pass category hint', async () => {
      mockExtractHint.mockReturnValueOnce({
        category: 'projects',
        originalText: '[project]',
      });
      
      const email = createTestEmail({
        subject: '[project] New project idea',
      });
      
      await emailService.processInboundEmail(email);
      
      expect(mockProcessMessage).toHaveBeenCalledWith(
        null,
        'Test message content',
        'projects',
        'email'
      );
    });

    it('should handle processing errors gracefully', async () => {
      mockProcessMessage.mockRejectedValueOnce(new Error('Processing failed'));
      
      const email = createTestEmail();
      const result = await emailService.processInboundEmail(email);
      
      expect(result.success).toBe(false);
      expect(result.error).toBe('Processing failed');
    });
  });

  describe('sendReply()', () => {
    it('should return error when thread not found', async () => {
      mockFindByThreadId.mockResolvedValueOnce(null);
      
      const result = await emailService.sendReply('nonexistent', 'Reply content');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Thread not found');
    });

    it('should send reply when thread exists', async () => {
      mockFindByThreadId.mockResolvedValueOnce({
        id: 'thread-1',
        messageId: '<original@example.com>',
        threadId: 'a1b2c3d4',
        subject: 'Original Subject',
        fromAddress: 'sender@example.com',
        conversationId: 'conv-1',
      });
      
      const result = await emailService.sendReply('a1b2c3d4', 'Reply content');
      
      expect(result.success).toBe(true);
      expect(mockSmtpSendReply).toHaveBeenCalledWith(
        'sender@example.com',
        'Re: Original Subject',
        'Reply content',
        '<original@example.com>',
        ['<original@example.com>']
      );
    });
  });

  describe('startPolling() / stopPolling()', () => {
    it('should delegate to ImapPoller', () => {
      emailService.startPolling();
      expect(mockImapStart).toHaveBeenCalled();
      
      emailService.stopPolling();
      expect(mockImapStop).toHaveBeenCalled();
    });
  });
});

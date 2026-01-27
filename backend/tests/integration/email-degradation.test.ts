/**
 * Integration tests for email channel graceful degradation
 * 
 * Tests that the application functions normally without email configuration.
 * 
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */

// Mock email config to simulate disabled state
jest.mock('../../src/config/email', () => ({
  getEmailConfig: jest.fn().mockReturnValue({
    smtp: null,
    imap: null,
    pollInterval: 60,
    enabled: false,
  }),
  resetEmailConfig: jest.fn(),
}));

// Mock SmtpSender to prevent actual SMTP initialization
jest.mock('../../src/services/smtp-sender', () => ({
  getSmtpSender: jest.fn().mockImplementation(() => ({
    isAvailable: jest.fn().mockReturnValue(false),
    sendEmail: jest.fn().mockResolvedValue({ success: false, error: 'SMTP not configured' }),
    sendReply: jest.fn().mockResolvedValue({ success: false, error: 'SMTP not configured' }),
  })),
  resetSmtpSender: jest.fn(),
}));

// Mock ImapPoller to prevent actual IMAP initialization
jest.mock('../../src/services/imap-poller', () => ({
  getImapPoller: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    isRunning: jest.fn().mockReturnValue(false),
    pollNow: jest.fn().mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: ['IMAP not configured'] }),
    setProcessor: jest.fn(),
  })),
  resetImapPoller: jest.fn(),
}));

// Mock ChatService to avoid GitService dependency
jest.mock('../../src/services/chat.service', () => ({
  getChatService: jest.fn().mockImplementation(() => ({
    processMessage: jest.fn().mockResolvedValue({
      conversationId: 'test-conv',
      message: { id: 'msg-1', role: 'assistant', content: 'Test', createdAt: new Date() },
      entry: null,
      clarificationNeeded: false,
    }),
  })),
  resetChatService: jest.fn(),
}));

// Mock ThreadTracker
jest.mock('../../src/services/thread-tracker', () => ({
  getThreadTracker: jest.fn().mockImplementation(() => ({
    generateThreadId: jest.fn().mockReturnValue('a1b2c3d4'),
    formatThreadId: jest.fn((id: string) => `[SB-${id}]`),
    createThread: jest.fn().mockResolvedValue({ id: 'thread-1', threadId: 'a1b2c3d4' }),
    findConversation: jest.fn().mockResolvedValue(null),
    getByMessageId: jest.fn().mockResolvedValue(null),
    findByThreadId: jest.fn().mockResolvedValue(null),
  })),
  resetThreadTracker: jest.fn(),
}));

// Mock EmailParser
jest.mock('../../src/services/email-parser', () => ({
  getEmailParser: jest.fn().mockImplementation(() => ({
    extractText: jest.fn().mockReturnValue('Test content'),
    extractHint: jest.fn().mockReturnValue(null),
    extractThreadId: jest.fn().mockReturnValue(null),
  })),
}));

// Mock ConfirmationSender
jest.mock('../../src/services/confirmation-sender', () => ({
  getConfirmationSender: jest.fn().mockImplementation(() => ({
    isAvailable: jest.fn().mockReturnValue(false),
    sendConfirmation: jest.fn().mockResolvedValue({ success: false, error: 'SMTP not configured' }),
  })),
  resetConfirmationSender: jest.fn(),
}));

import { EmailService, resetEmailService } from '../../src/services/email.service';
import { DigestMailer, resetDigestMailer } from '../../src/services/digest-mailer';

describe('Email Channel Graceful Degradation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetEmailService();
    resetDigestMailer();
  });

  afterEach(() => {
    resetEmailService();
    resetDigestMailer();
  });

  describe('EmailService.isEnabled()', () => {
    it('should return false when email is not configured', () => {
      const emailService = new EmailService();
      expect(emailService.isEnabled()).toBe(false);
    });
  });

  describe('DigestMailer.isAvailable()', () => {
    it('should return false when email is not configured', () => {
      const digestMailer = new DigestMailer();
      expect(digestMailer.isAvailable()).toBe(false);
    });
  });

  describe('DigestMailer skips delivery silently', () => {
    it('should return skipped=true for daily digest when disabled', async () => {
      const digestMailer = new DigestMailer();
      const result = await digestMailer.sendDailyDigest('test@example.com', 'Test content');
      
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return skipped=true for weekly review when disabled', async () => {
      const digestMailer = new DigestMailer();
      const result = await digestMailer.sendWeeklyReview('test@example.com', 'Test content');
      
      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should not attempt to send email when disabled', async () => {
      const { getSmtpSender } = require('../../src/services/smtp-sender');
      const mockSendEmail = jest.fn();
      getSmtpSender.mockReturnValue({
        isAvailable: jest.fn().mockReturnValue(false),
        sendEmail: mockSendEmail,
      });

      const digestMailer = new DigestMailer();
      await digestMailer.sendDailyDigest('test@example.com', 'Test content');
      
      expect(mockSendEmail).not.toHaveBeenCalled();
    });
  });

  describe('Application starts without email config', () => {
    it('should create EmailService without throwing', () => {
      expect(() => new EmailService()).not.toThrow();
    });

    it('should create DigestMailer without throwing', () => {
      expect(() => new DigestMailer()).not.toThrow();
    });

    it('should allow calling startPolling without error', () => {
      const emailService = new EmailService();
      expect(() => emailService.startPolling()).not.toThrow();
    });

    it('should allow calling stopPolling without error', () => {
      const emailService = new EmailService();
      expect(() => emailService.stopPolling()).not.toThrow();
    });
  });

  describe('Email operations fail gracefully', () => {
    it('should return error result for sendReply when disabled', async () => {
      const emailService = new EmailService();
      const result = await emailService.sendReply('thread-id', 'Reply content');
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

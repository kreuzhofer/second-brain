/**
 * Unit tests for ImapPoller service
 * Requirements: 7.4 - Test start/stop lifecycle and error handling
 */

import {
  ImapPoller,
  PollResult,
  EmailProcessor,
  resetImapPoller,
  ImapConnectionError,
  getImapPoller,
} from '../../../src/services/imap-poller';

jest.mock('../../../src/config/email', () => ({
  getEmailConfig: jest.fn(),
  resetEmailConfig: jest.fn(),
}));

jest.mock('node-imap', () => {
  return jest.fn().mockImplementation(() => ({
    once: jest.fn(),
    connect: jest.fn(),
    end: jest.fn(),
    openBox: jest.fn(),
    search: jest.fn(),
    fetch: jest.fn(),
    addFlags: jest.fn(),
  }));
});

jest.mock('../../../src/services/email-parser', () => ({
  getEmailParser: jest.fn().mockReturnValue({
    parse: jest.fn(),
    extractText: jest.fn(),
    extractHint: jest.fn(),
    extractThreadId: jest.fn(),
  }),
}));

jest.mock('../../../src/services/thread-tracker', () => ({
  getThreadTracker: jest.fn().mockReturnValue({
    getByMessageId: jest.fn().mockResolvedValue(null),
    generateThreadId: jest.fn(),
    formatThreadId: jest.fn(),
    createThread: jest.fn(),
    findConversation: jest.fn(),
  }),
}));

jest.mock('../../../src/services/smtp-sender', () => {
  const sendReply = jest.fn().mockResolvedValue({ success: true, messageId: 'reply-1' });
  const isAvailable = jest.fn().mockReturnValue(true);
  return {
    getSmtpSender: jest.fn().mockReturnValue({
      sendReply,
      isAvailable,
      sendEmail: jest.fn(),
      verify: jest.fn(),
    }),
    __mockSendReply: sendReply,
    __mockIsAvailable: isAvailable,
  };
});

jest.mock('../../../src/services/user.service', () => ({
  getUserService: jest.fn().mockReturnValue({
    getUserByInboundCode: jest.fn().mockResolvedValue(null),
  }),
}));

import { getEmailConfig } from '../../../src/config/email';

// Get references to hoisted mock fns
const { __mockSendReply: mockSendReply, __mockIsAvailable: mockIsAvailable } =
  jest.requireMock('../../../src/services/smtp-sender') as {
    __mockSendReply: jest.Mock;
    __mockIsAvailable: jest.Mock;
  };

describe('ImapPoller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetImapPoller();
    jest.useFakeTimers();
  });

  afterEach(() => {
    resetImapPoller();
    jest.useRealTimers();
  });

  const mockConfiguredConfig = () => {
    (getEmailConfig as jest.Mock).mockReturnValue({
      smtp: { host: 'smtp.example.com', port: 587, user: 'user@example.com', pass: 'pass', secure: false },
      imap: { host: 'imap.example.com', user: 'user@example.com', pass: 'pass', port: 993, tls: true },
      pollInterval: 60,
      enabled: true,
    });
  };

  const mockUnconfiguredConfig = () => {
    (getEmailConfig as jest.Mock).mockReturnValue({
      smtp: null,
      imap: null,
      pollInterval: 60,
      enabled: false,
    });
  };

  describe('start/stop lifecycle', () => {
    it('should set running state to true when started', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      jest.spyOn(poller, 'pollNow').mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: [] });
      expect(poller.isRunning()).toBe(false);
      poller.start();
      expect(poller.isRunning()).toBe(true);
      poller.stop();
    });

    it('should not start when IMAP is not configured', () => {
      mockUnconfiguredConfig();
      const poller = new ImapPoller();
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      poller.start();
      expect(poller.isRunning()).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith('ImapPoller: IMAP not configured, cannot start polling');
      consoleSpy.mockRestore();
    });

    it('should warn when already running', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      jest.spyOn(poller, 'pollNow').mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: [] });
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      poller.start();
      poller.start();
      expect(consoleSpy).toHaveBeenCalledWith('ImapPoller: Already running');
      poller.stop();
      consoleSpy.mockRestore();
    });

    it('should log start message', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      jest.spyOn(poller, 'pollNow').mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: [] });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      poller.start();
      expect(consoleSpy).toHaveBeenCalledWith('ImapPoller: Starting polling every 60 seconds');
      poller.stop();
      consoleSpy.mockRestore();
    });

    it('should trigger immediate poll on start', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      const pollNowSpy = jest.spyOn(poller, 'pollNow').mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: [] });
      poller.start();
      expect(pollNowSpy).toHaveBeenCalledTimes(1);
      poller.stop();
    });

    it('should set running to false when stopped', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      jest.spyOn(poller, 'pollNow').mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: [] });
      poller.start();
      poller.stop();
      expect(poller.isRunning()).toBe(false);
    });

    it('should log stop message', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      jest.spyOn(poller, 'pollNow').mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: [] });
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      poller.start();
      poller.stop();
      expect(consoleSpy).toHaveBeenCalledWith('ImapPoller: Stopped polling');
      consoleSpy.mockRestore();
    });

    it('should be safe to call stop when not running', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      expect(() => poller.stop()).not.toThrow();
    });

    it('should clear polling interval on stop', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
      jest.spyOn(poller, 'pollNow').mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: [] });
      poller.start();
      poller.stop();
      expect(clearIntervalSpy).toHaveBeenCalled();
      clearIntervalSpy.mockRestore();
    });

    it('should accept processor callback', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      const processor: EmailProcessor = jest.fn().mockResolvedValue(true);
      expect(() => poller.setProcessor(processor)).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should return error when IMAP not configured', async () => {
      mockUnconfiguredConfig();
      const poller = new ImapPoller();
      const result = await poller.pollNow();
      expect(result.emailsFound).toBe(0);
      expect(result.emailsProcessed).toBe(0);
      expect(result.errors).toContain('IMAP not configured');
    });

    it('should continue when initial poll fails', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      jest.spyOn(poller, 'pollNow').mockRejectedValue(new Error('Poll failed'));
      expect(() => poller.start()).not.toThrow();
      expect(poller.isRunning()).toBe(true);
      poller.stop();
      consoleSpy.mockRestore();
    });
  });

  describe('ImapConnectionError', () => {
    it('should create error with correct message', () => {
      const error = new ImapConnectionError('Test error');
      expect(error.message).toBe('IMAP connection failed: Test error');
      expect(error.name).toBe('ImapConnectionError');
    });

    it('should store original error', () => {
      const originalError = new Error('Original');
      const error = new ImapConnectionError('Test error', originalError);
      expect(error.originalError).toBe(originalError);
    });

    it('should be instance of Error', () => {
      const error = new ImapConnectionError('Test error');
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe('polling interval', () => {
    it('should poll at configured interval', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      const pollNowSpy = jest.spyOn(poller, 'pollNow').mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: [] });
      poller.start();
      expect(pollNowSpy).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(60000);
      expect(pollNowSpy).toHaveBeenCalledTimes(2);
      jest.advanceTimersByTime(60000);
      expect(pollNowSpy).toHaveBeenCalledTimes(3);
      poller.stop();
    });

    it('should stop polling after stop()', () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      const pollNowSpy = jest.spyOn(poller, 'pollNow').mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: [] });
      poller.start();
      poller.stop();
      jest.advanceTimersByTime(120000);
      expect(pollNowSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('singleton', () => {
    it('should return same instance', () => {
      mockConfiguredConfig();
      resetImapPoller();
      const instance1 = getImapPoller();
      const instance2 = getImapPoller();
      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', () => {
      mockConfiguredConfig();
      const instance1 = getImapPoller();
      resetImapPoller();
      const instance2 = getImapPoller();
      expect(instance1).not.toBe(instance2);
    });

    it('should stop polling on reset', () => {
      mockConfiguredConfig();
      const instance = getImapPoller();
      jest.spyOn(instance, 'pollNow').mockResolvedValue({ emailsFound: 0, emailsProcessed: 0, errors: [] });
      instance.start();
      expect(instance.isRunning()).toBe(true);
      resetImapPoller();
      expect(instance.isRunning()).toBe(false);
    });
  });

  describe('PollResult', () => {
    it('should have correct structure', async () => {
      mockUnconfiguredConfig();
      const poller = new ImapPoller();
      const result: PollResult = await poller.pollNow();
      expect(result).toHaveProperty('emailsFound');
      expect(result).toHaveProperty('emailsProcessed');
      expect(result).toHaveProperty('errors');
      expect(typeof result.emailsFound).toBe('number');
      expect(typeof result.emailsProcessed).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('no-code auto-reply and drop', () => {
    const makeEmail = (from: string, to: string, subject = 'Test') => ({
      messageId: '<test-msg-1@example.com>',
      subject,
      from: { address: from },
      to: [{ address: to }],
      date: new Date('2026-01-01'),
      text: 'Hello',
      html: '',
      cc: [],
      attachments: [],
    });

    it('should send auto-reply and drop email when no routing code', async () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      const processor: EmailProcessor = jest.fn().mockResolvedValue(true);
      poller.setProcessor(processor);

      // Mock fetchUnseenEmails to return an email without +code
      const email = makeEmail('sender@external.com', 'inbox@example.com');
      jest.spyOn(poller as any, 'fetchUnseenEmails').mockResolvedValue([email]);
      mockSendReply.mockClear();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const result = await poller.pollNow();
      consoleSpy.mockRestore();

      // Should NOT have processed via the normal processor
      expect(processor).not.toHaveBeenCalled();
      expect(result.emailsProcessed).toBe(0);

      // Should have sent auto-reply
      expect(mockSendReply).toHaveBeenCalledTimes(1);
      expect(mockSendReply).toHaveBeenCalledWith(
        'sender@external.com',
        'Re: Test',
        expect.stringContaining('personal routing code'),
        '<test-msg-1@example.com>',
      );
    });

    it('should not send auto-reply when SMTP is unavailable', async () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      const processor: EmailProcessor = jest.fn().mockResolvedValue(true);
      poller.setProcessor(processor);

      const email = makeEmail('sender@external.com', 'inbox@example.com');
      jest.spyOn(poller as any, 'fetchUnseenEmails').mockResolvedValue([email]);
      mockSendReply.mockClear();
      mockIsAvailable.mockReturnValueOnce(false);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await poller.pollNow();
      consoleSpy.mockRestore();

      expect(mockSendReply).not.toHaveBeenCalled();
      expect(processor).not.toHaveBeenCalled();
    });

    it('should still drop email even if auto-reply fails', async () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      const processor: EmailProcessor = jest.fn().mockResolvedValue(true);
      poller.setProcessor(processor);

      const email = makeEmail('sender@external.com', 'inbox@example.com');
      jest.spyOn(poller as any, 'fetchUnseenEmails').mockResolvedValue([email]);
      mockSendReply.mockClear();
      mockSendReply.mockRejectedValueOnce(new Error('SMTP down'));

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const errorSpy = jest.spyOn(console, 'error').mockImplementation();
      const result = await poller.pollNow();
      consoleSpy.mockRestore();
      errorSpy.mockRestore();

      // Email should be dropped regardless
      expect(processor).not.toHaveBeenCalled();
      expect(result.emailsProcessed).toBe(0);
    });

    it('should log drop message with messageId', async () => {
      mockConfiguredConfig();
      const poller = new ImapPoller();
      poller.setProcessor(jest.fn().mockResolvedValue(true));

      const email = makeEmail('sender@external.com', 'inbox@example.com');
      jest.spyOn(poller as any, 'fetchUnseenEmails').mockResolvedValue([email]);
      mockSendReply.mockClear();

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      await poller.pollNow();

      const dropLog = consoleSpy.mock.calls.find(
        (args) => typeof args[0] === 'string' && args[0].includes('dropping email')
      );
      expect(dropLog).toBeDefined();
      expect(dropLog![0]).toContain('<test-msg-1@example.com>');
      consoleSpy.mockRestore();
    });
  });
});

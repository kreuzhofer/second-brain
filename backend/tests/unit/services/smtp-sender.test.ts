/**
 * Unit tests for SmtpSender service
 * Tests email sending functionality with mocked nodemailer.
 *
 * Requirements: 5.1, 5.3, 5.6
 */

import {
  SmtpSender,
  SendEmailOptions,
  resetSmtpSender,
} from '../../../src/services/smtp-sender';
import { resetEmailConfig } from '../../../src/config/email';

// Mock nodemailer
const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn().mockImplementation(() => ({
  sendMail: mockSendMail,
}));

jest.mock('nodemailer', () => ({
  createTransport: (options: unknown) => mockCreateTransport(options),
}));

// Mock email config
jest.mock('../../../src/config/email', () => {
  const originalModule = jest.requireActual('../../../src/config/email');
  return {
    ...originalModule,
    getEmailConfig: jest.fn(),
    resetEmailConfig: jest.fn(),
  };
});

import { getEmailConfig } from '../../../src/config/email';

describe('SmtpSender', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetSmtpSender();
  });

  // ============================================
  // Constructor and Initialization Tests
  // ============================================

  describe('initialization', () => {
    it('should create transporter when SMTP is configured', () => {
      (getEmailConfig as jest.Mock).mockReturnValue({
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          user: 'user@example.com',
          pass: 'password123',
          secure: false,
        },
        imap: null,
        pollInterval: 60,
        enabled: false,
      });

      const sender = new SmtpSender();

      expect(mockCreateTransport).toHaveBeenCalledWith({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: {
          user: 'user@example.com',
          pass: 'password123',
        },
      });
      expect(sender.isAvailable()).toBe(true);
    });

    it('should not create transporter when SMTP is not configured', () => {
      (getEmailConfig as jest.Mock).mockReturnValue({
        smtp: null,
        imap: null,
        pollInterval: 60,
        enabled: false,
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const sender = new SmtpSender();

      expect(mockCreateTransport).not.toHaveBeenCalled();
      expect(sender.isAvailable()).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        'SmtpSender: SMTP not configured, email sending disabled'
      );

      consoleSpy.mockRestore();
    });

    it('should use secure: true for port 465', () => {
      (getEmailConfig as jest.Mock).mockReturnValue({
        smtp: {
          host: 'smtp.example.com',
          port: 465,
          user: 'user@example.com',
          pass: 'password123',
          secure: true,
        },
        imap: null,
        pollInterval: 60,
        enabled: false,
      });

      new SmtpSender();

      expect(mockCreateTransport).toHaveBeenCalledWith(
        expect.objectContaining({
          port: 465,
          secure: true,
        })
      );
    });
  });

  // ============================================
  // isAvailable() Tests
  // ============================================

  describe('isAvailable', () => {
    it('should return true when SMTP is configured and transporter exists', () => {
      (getEmailConfig as jest.Mock).mockReturnValue({
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          user: 'user@example.com',
          pass: 'password123',
          secure: false,
        },
        imap: null,
        pollInterval: 60,
        enabled: false,
      });

      const sender = new SmtpSender();
      expect(sender.isAvailable()).toBe(true);
    });

    it('should return false when SMTP is not configured', () => {
      (getEmailConfig as jest.Mock).mockReturnValue({
        smtp: null,
        imap: null,
        pollInterval: 60,
        enabled: false,
      });

      jest.spyOn(console, 'warn').mockImplementation();
      const sender = new SmtpSender();
      expect(sender.isAvailable()).toBe(false);
    });
  });

  // ============================================
  // sendEmail() Tests
  // ============================================

  describe('sendEmail', () => {
    beforeEach(() => {
      (getEmailConfig as jest.Mock).mockReturnValue({
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          user: 'sender@example.com',
          pass: 'password123',
          secure: false,
        },
        imap: null,
        pollInterval: 60,
        enabled: false,
      });
    });

    // Requirement 5.1: Send email for generic email sending
    it('should send email successfully and return messageId', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<generated123@smtp.example.com>',
      });

      const sender = new SmtpSender();
      const options: SendEmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test body content',
      };

      const result = await sender.sendEmail(options);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('<generated123@smtp.example.com>');
      expect(result.error).toBeUndefined();
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test body content',
      });
    });

    it('should include HTML when provided', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<html123@smtp.example.com>',
      });

      const sender = new SmtpSender();
      const options: SendEmailOptions = {
        to: 'recipient@example.com',
        subject: 'HTML Email',
        text: 'Plain text fallback',
        html: '<h1>HTML Content</h1>',
      };

      const result = await sender.sendEmail(options);

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Plain text fallback',
          html: '<h1>HTML Content</h1>',
        })
      );
    });

    // Requirement 5.3: Set In-Reply-To and References headers
    it('should include In-Reply-To header when provided', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<reply123@smtp.example.com>',
      });

      const sender = new SmtpSender();
      const options: SendEmailOptions = {
        to: 'recipient@example.com',
        subject: 'Re: Original Subject',
        text: 'Reply content',
        inReplyTo: '<original@example.com>',
      };

      const result = await sender.sendEmail(options);

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<original@example.com>',
        })
      );
    });

    it('should include References header when provided', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<refs123@smtp.example.com>',
      });

      const sender = new SmtpSender();
      const options: SendEmailOptions = {
        to: 'recipient@example.com',
        subject: 'Re: Re: Original Subject',
        text: 'Reply content',
        inReplyTo: '<reply@example.com>',
        references: ['<original@example.com>', '<reply@example.com>'],
      };

      const result = await sender.sendEmail(options);

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<reply@example.com>',
          references: ['<original@example.com>', '<reply@example.com>'],
        })
      );
    });

    // Requirement 5.6: Handle send failures gracefully
    it('should return error result when send fails (not throw)', async () => {
      mockSendMail.mockRejectedValue(new Error('Connection refused'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const sender = new SmtpSender();
      const options: SendEmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test body',
      };

      const result = await sender.sendEmail(options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Connection refused');
      expect(result.messageId).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        'SmtpSender: Failed to send email:',
        expect.objectContaining({
          to: 'recipient@example.com',
          subject: 'Test Subject',
          error: 'Connection refused',
        })
      );

      consoleSpy.mockRestore();
    });

    it('should handle non-Error exceptions gracefully', async () => {
      mockSendMail.mockRejectedValue('String error');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const sender = new SmtpSender();
      const options: SendEmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test body',
      };

      const result = await sender.sendEmail(options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');

      consoleSpy.mockRestore();
    });

    it('should return error when SMTP is not available', async () => {
      (getEmailConfig as jest.Mock).mockReturnValue({
        smtp: null,
        imap: null,
        pollInterval: 60,
        enabled: false,
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const sender = new SmtpSender();
      const options: SendEmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test body',
      };

      const result = await sender.sendEmail(options);

      expect(result.success).toBe(false);
      expect(result.error).toBe('SMTP not configured or unavailable');

      consoleSpy.mockRestore();
    });

    it('should not include empty references array', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<empty-refs@smtp.example.com>',
      });

      const sender = new SmtpSender();
      const options: SendEmailOptions = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test body',
        references: [],
      };

      await sender.sendEmail(options);

      // Should not include references key when array is empty
      expect(mockSendMail).toHaveBeenCalledWith({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Test body',
      });
    });
  });

  // ============================================
  // sendReply() Tests
  // ============================================

  describe('sendReply', () => {
    beforeEach(() => {
      (getEmailConfig as jest.Mock).mockReturnValue({
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          user: 'sender@example.com',
          pass: 'password123',
          secure: false,
        },
        imap: null,
        pollInterval: 60,
        enabled: false,
      });
    });

    // Requirement 5.3: Send reply with In-Reply-To and References headers
    it('should send reply with correct threading headers', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<reply-msg@smtp.example.com>',
      });

      const sender = new SmtpSender();
      const result = await sender.sendReply(
        'recipient@example.com',
        'Re: Original Subject [SB-a1b2c3d4]',
        'Reply body content',
        '<original@example.com>'
      );

      expect(result.success).toBe(true);
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'recipient@example.com',
          subject: 'Re: Original Subject [SB-a1b2c3d4]',
          text: 'Reply body content',
          inReplyTo: '<original@example.com>',
          references: ['<original@example.com>'],
        })
      );
    });

    it('should include existing references plus original message', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<chain-reply@smtp.example.com>',
      });

      const sender = new SmtpSender();
      const existingRefs = ['<first@example.com>', '<second@example.com>'];

      await sender.sendReply(
        'recipient@example.com',
        'Re: Re: Re: Subject',
        'Deep reply',
        '<third@example.com>',
        existingRefs
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          inReplyTo: '<third@example.com>',
          references: [
            '<first@example.com>',
            '<second@example.com>',
            '<third@example.com>',
          ],
        })
      );
    });

    it('should not duplicate originalMessageId in references', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<no-dup@smtp.example.com>',
      });

      const sender = new SmtpSender();
      const existingRefs = ['<first@example.com>', '<original@example.com>'];

      await sender.sendReply(
        'recipient@example.com',
        'Re: Subject',
        'Reply',
        '<original@example.com>',
        existingRefs
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          references: ['<first@example.com>', '<original@example.com>'],
        })
      );
    });

    it('should include HTML when provided', async () => {
      mockSendMail.mockResolvedValue({
        messageId: '<html-reply@smtp.example.com>',
      });

      const sender = new SmtpSender();
      await sender.sendReply(
        'recipient@example.com',
        'Re: Subject',
        'Plain text reply',
        '<original@example.com>',
        undefined,
        '<p>HTML reply</p>'
      );

      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Plain text reply',
          html: '<p>HTML reply</p>',
        })
      );
    });

    it('should handle send failure gracefully', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP timeout'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const sender = new SmtpSender();

      const result = await sender.sendReply(
        'recipient@example.com',
        'Re: Subject',
        'Reply body',
        '<original@example.com>'
      );

      expect(result.success).toBe(false);
      expect(result.error).toBe('SMTP timeout');

      consoleSpy.mockRestore();
    });
  });

  // ============================================
  // Singleton Tests
  // ============================================

  describe('singleton', () => {
    it('should return same instance on multiple calls to getSmtpSender', async () => {
      (getEmailConfig as jest.Mock).mockReturnValue({
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          user: 'user@example.com',
          pass: 'password123',
          secure: false,
        },
        imap: null,
        pollInterval: 60,
        enabled: false,
      });

      // Import getSmtpSender
      const { getSmtpSender } = await import('../../../src/services/smtp-sender');

      const instance1 = getSmtpSender();
      const instance2 = getSmtpSender();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance after reset', async () => {
      (getEmailConfig as jest.Mock).mockReturnValue({
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          user: 'user@example.com',
          pass: 'password123',
          secure: false,
        },
        imap: null,
        pollInterval: 60,
        enabled: false,
      });

      const { getSmtpSender, resetSmtpSender } = await import(
        '../../../src/services/smtp-sender'
      );

      const instance1 = getSmtpSender();
      resetSmtpSender();
      const instance2 = getSmtpSender();

      expect(instance1).not.toBe(instance2);
    });
  });
});

/**
 * Unit tests for ConfirmationSender service
 * 
 * Tests:
 * - formatConfirmationEmail() builds correct content
 * - Entry name, category, confidence included in message
 * - Clarification instructions for low-confidence entries
 * - Thread ID in subject and body footer
 * - sendConfirmation() uses SmtpSender correctly
 * 
 * Requirements: 5.2, 5.4, 5.5
 */

import {
  ConfirmationSender,
  ConfirmationEntryInfo,
  LOW_CONFIDENCE_THRESHOLD,
  getConfirmationSender,
  resetConfirmationSender,
} from '../../../src/services/confirmation-sender';
import { SmtpSender, SendEmailResult } from '../../../src/services/smtp-sender';
import { ThreadTracker } from '../../../src/services/thread-tracker';

// ============================================
// Mock Setup
// ============================================

// Mock SmtpSender
const mockSmtpSender = {
  isAvailable: jest.fn(),
  sendEmail: jest.fn(),
  sendReply: jest.fn(),
} as unknown as SmtpSender;

// Mock ThreadTracker
const mockThreadTracker = {
  generateThreadId: jest.fn(),
  formatThreadId: jest.fn((threadId: string) => `[SB-${threadId}]`),
  createThread: jest.fn(),
  findConversation: jest.fn(),
  getByMessageId: jest.fn(),
} as unknown as ThreadTracker;

describe('ConfirmationSender', () => {
  let confirmationSender: ConfirmationSender;

  beforeEach(() => {
    jest.clearAllMocks();
    resetConfirmationSender();
    confirmationSender = new ConfirmationSender(mockSmtpSender, mockThreadTracker);
  });

  // ============================================
  // isAvailable() Tests
  // ============================================

  describe('isAvailable()', () => {
    it('returns true when SMTP is available', () => {
      (mockSmtpSender.isAvailable as jest.Mock).mockReturnValue(true);
      
      expect(confirmationSender.isAvailable()).toBe(true);
      expect(mockSmtpSender.isAvailable).toHaveBeenCalled();
    });

    it('returns false when SMTP is not available', () => {
      (mockSmtpSender.isAvailable as jest.Mock).mockReturnValue(false);
      
      expect(confirmationSender.isAvailable()).toBe(false);
      expect(mockSmtpSender.isAvailable).toHaveBeenCalled();
    });
  });

  // ============================================
  // formatConfirmationEmail() Tests
  // ============================================

  describe('formatConfirmationEmail()', () => {
    const threadId = 'a1b2c3d4';
    const originalSubject = 'My thought about something';

    describe('subject formatting', () => {
      it('includes Re: prefix in subject', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Test Entry',
          category: 'ideas',
          confidence: 0.9,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.subject).toMatch(/^Re:/);
      });

      it('includes thread ID in subject (Requirement 5.4)', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Test Entry',
          category: 'ideas',
          confidence: 0.9,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.subject).toContain('[SB-a1b2c3d4]');
      });

      it('includes original subject in reply subject', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Test Entry',
          category: 'ideas',
          confidence: 0.9,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.subject).toContain(originalSubject);
        expect(result.subject).toBe(`Re: ${originalSubject} [SB-${threadId}]`);
      });
    });

    describe('body content - entry details (Requirement 5.2)', () => {
      it('includes entry name in body', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Meeting with John',
          category: 'people',
          confidence: 0.85,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).toContain('Entry: Meeting with John');
      });

      it('includes category in body', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Test Entry',
          category: 'projects',
          confidence: 0.85,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).toContain('Category: projects');
      });

      it('includes confidence score as percentage in body', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Test Entry',
          category: 'ideas',
          confidence: 0.85,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).toContain('Confidence: 85%');
      });

      it('rounds confidence percentage correctly', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Test Entry',
          category: 'ideas',
          confidence: 0.867,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).toContain('Confidence: 87%');
      });
    });

    describe('body content - thread ID footer (Requirement 5.4)', () => {
      it('includes thread ID in body footer', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Test Entry',
          category: 'ideas',
          confidence: 0.9,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).toContain('Thread ID: [SB-a1b2c3d4]');
      });

      it('includes reply instructions in footer', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Test Entry',
          category: 'ideas',
          confidence: 0.9,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).toContain('Reply to this email to continue the conversation.');
      });

      it('includes separator before footer', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Test Entry',
          category: 'ideas',
          confidence: 0.9,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).toContain('---');
      });
    });

    describe('clarification instructions for low-confidence entries (Requirement 5.5)', () => {
      it('includes clarification instructions when confidence is below threshold', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Unclear Entry',
          category: 'inbox',
          confidence: 0.5,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).toContain('routed to your inbox due to low confidence');
        expect(result.body).toContain('To reclassify');
        expect(result.body).toContain('[person]');
        expect(result.body).toContain('[project]');
        expect(result.body).toContain('[idea]');
        expect(result.body).toContain('[task]');
      });

      it('includes example of how to reclassify', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Unclear Entry',
          category: 'inbox',
          confidence: 0.5,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).toContain('[project] This should be a project');
      });

      it('does NOT include clarification instructions when confidence is at threshold', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Clear Entry',
          category: 'ideas',
          confidence: LOW_CONFIDENCE_THRESHOLD,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).not.toContain('routed to your inbox');
        expect(result.body).not.toContain('To reclassify');
      });

      it('does NOT include clarification instructions when confidence is above threshold', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Clear Entry',
          category: 'projects',
          confidence: 0.9,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).not.toContain('routed to your inbox');
        expect(result.body).not.toContain('To reclassify');
      });

      it('includes clarification instructions when confidence is just below threshold', () => {
        const entry: ConfirmationEntryInfo = {
          name: 'Borderline Entry',
          category: 'inbox',
          confidence: LOW_CONFIDENCE_THRESHOLD - 0.01,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.body).toContain('routed to your inbox due to low confidence');
      });
    });

    describe('all categories', () => {
      const categories = ['people', 'projects', 'ideas', 'admin', 'inbox'] as const;

      it.each(categories)('formats correctly for %s category', (category) => {
        const entry: ConfirmationEntryInfo = {
          name: `Test ${category} Entry`,
          category,
          confidence: 0.85,
        };

        const result = confirmationSender.formatConfirmationEmail(
          originalSubject,
          threadId,
          entry
        );

        expect(result.subject).toContain('Re:');
        expect(result.subject).toContain('[SB-');
        expect(result.body).toContain(`Entry: Test ${category} Entry`);
        expect(result.body).toContain(`Category: ${category}`);
        expect(result.body).toContain('Confidence: 85%');
        expect(result.body).toContain('Thread ID:');
      });
    });
  });

  // ============================================
  // sendConfirmation() Tests
  // ============================================

  describe('sendConfirmation()', () => {
    const defaultParams = {
      to: 'user@example.com',
      originalSubject: 'My thought',
      originalMessageId: '<original-123@example.com>',
      threadId: 'a1b2c3d4',
      entry: {
        name: 'Test Entry',
        category: 'ideas' as const,
        confidence: 0.85,
      },
    };

    it('calls SmtpSender.sendReply with correct parameters', async () => {
      const mockResult: SendEmailResult = {
        success: true,
        messageId: '<reply-456@example.com>',
      };
      (mockSmtpSender.sendReply as jest.Mock).mockResolvedValue(mockResult);

      await confirmationSender.sendConfirmation(defaultParams);

      expect(mockSmtpSender.sendReply).toHaveBeenCalledWith(
        'user@example.com',
        expect.stringContaining('Re: My thought'),
        expect.stringContaining('Test Entry'),
        '<original-123@example.com>',
        undefined
      );
    });

    it('includes thread ID in subject when calling sendReply', async () => {
      const mockResult: SendEmailResult = { success: true };
      (mockSmtpSender.sendReply as jest.Mock).mockResolvedValue(mockResult);

      await confirmationSender.sendConfirmation(defaultParams);

      const callArgs = (mockSmtpSender.sendReply as jest.Mock).mock.calls[0];
      const subject = callArgs[1];
      expect(subject).toContain('[SB-a1b2c3d4]');
    });

    it('includes entry details in body when calling sendReply', async () => {
      const mockResult: SendEmailResult = { success: true };
      (mockSmtpSender.sendReply as jest.Mock).mockResolvedValue(mockResult);

      await confirmationSender.sendConfirmation(defaultParams);

      const callArgs = (mockSmtpSender.sendReply as jest.Mock).mock.calls[0];
      const body = callArgs[2];
      expect(body).toContain('Entry: Test Entry');
      expect(body).toContain('Category: ideas');
      expect(body).toContain('Confidence: 85%');
    });

    it('passes references to sendReply when provided', async () => {
      const mockResult: SendEmailResult = { success: true };
      (mockSmtpSender.sendReply as jest.Mock).mockResolvedValue(mockResult);

      const paramsWithRefs = {
        ...defaultParams,
        references: ['<ref1@example.com>', '<ref2@example.com>'],
      };

      await confirmationSender.sendConfirmation(paramsWithRefs);

      expect(mockSmtpSender.sendReply).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        ['<ref1@example.com>', '<ref2@example.com>']
      );
    });

    it('returns success result from SmtpSender', async () => {
      const mockResult: SendEmailResult = {
        success: true,
        messageId: '<reply-456@example.com>',
      };
      (mockSmtpSender.sendReply as jest.Mock).mockResolvedValue(mockResult);

      const result = await confirmationSender.sendConfirmation(defaultParams);

      expect(result).toEqual(mockResult);
    });

    it('returns error result from SmtpSender on failure', async () => {
      const mockResult: SendEmailResult = {
        success: false,
        error: 'SMTP connection failed',
      };
      (mockSmtpSender.sendReply as jest.Mock).mockResolvedValue(mockResult);

      const result = await confirmationSender.sendConfirmation(defaultParams);

      expect(result).toEqual(mockResult);
    });

    it('includes clarification instructions for low-confidence entries', async () => {
      const mockResult: SendEmailResult = { success: true };
      (mockSmtpSender.sendReply as jest.Mock).mockResolvedValue(mockResult);

      const lowConfidenceParams = {
        ...defaultParams,
        entry: {
          name: 'Unclear Entry',
          category: 'inbox' as const,
          confidence: 0.5,
        },
      };

      await confirmationSender.sendConfirmation(lowConfidenceParams);

      const callArgs = (mockSmtpSender.sendReply as jest.Mock).mock.calls[0];
      const body = callArgs[2];
      expect(body).toContain('routed to your inbox due to low confidence');
    });
  });

  // ============================================
  // Singleton Tests
  // ============================================

  describe('singleton accessor', () => {
    beforeEach(() => {
      resetConfirmationSender();
    });

    it('returns the same instance on multiple calls', () => {
      const instance1 = getConfirmationSender();
      const instance2 = getConfirmationSender();

      expect(instance1).toBe(instance2);
    });

    it('returns a new instance after reset', () => {
      const instance1 = getConfirmationSender();
      resetConfirmationSender();
      const instance2 = getConfirmationSender();

      expect(instance1).not.toBe(instance2);
    });
  });
});

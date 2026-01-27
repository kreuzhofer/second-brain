/**
 * Property-based tests for DigestMailer email formatting
 * 
 * **Property 8: Digest email formatting**
 * - Verify subject indicates digest type
 * - Verify body contains digest content
 * - Verify no In-Reply-To header (sent as new thread)
 * 
 * **Validates: Requirements 6.2, 6.3, 6.4**
 */

import * as fc from 'fast-check';
import { DigestMailer, resetDigestMailer } from '../../src/services/digest-mailer';
import { SmtpSender, SendEmailResult, SendEmailOptions } from '../../src/services/smtp-sender';

// Mock email config
jest.mock('../../src/config/email', () => ({
  getEmailConfig: jest.fn().mockReturnValue({
    smtp: { host: 'smtp.test.com', port: 587, user: 'test@test.com', pass: 'pass', secure: false },
    imap: null,
    pollInterval: 60,
    enabled: true,
  }),
  resetEmailConfig: jest.fn(),
}));

describe('DigestMailer Property Tests', () => {
  // Track sent emails for verification
  let sentEmails: SendEmailOptions[] = [];
  let mockSmtpSender: SmtpSender;

  beforeEach(() => {
    jest.clearAllMocks();
    resetDigestMailer();
    sentEmails = [];

    // Create mock SmtpSender that captures sent emails
    mockSmtpSender = {
      isAvailable: jest.fn().mockReturnValue(true),
      sendEmail: jest.fn().mockImplementation(async (options: SendEmailOptions): Promise<SendEmailResult> => {
        sentEmails.push(options);
        return { success: true, messageId: `<${Date.now()}@test.com>` };
      }),
      sendReply: jest.fn(),
    } as unknown as SmtpSender;
  });

  afterEach(() => {
    resetDigestMailer();
  });

  /**
   * Property 8.1: Daily digest subject indicates digest type
   * **Validates: Requirement 6.2**
   */
  describe('Property 8.1: Daily digest subject indicates digest type', () => {
    it('should include "Daily Digest" in subject', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (email, content) => {
            sentEmails = []; // Clear before each iteration
            const mailer = new DigestMailer(mockSmtpSender);
            await mailer.sendDailyDigest(email, content);

            expect(sentEmails.length).toBe(1);
            expect(sentEmails[0].subject).toContain('Daily Digest');
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should include date in daily digest subject', async () => {
      const mailer = new DigestMailer(mockSmtpSender);
      const subject = mailer.formatDailySubject();

      // Should contain day of week
      const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const containsDay = daysOfWeek.some(day => subject.includes(day));
      expect(containsDay).toBe(true);

      // Should contain month
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                      'July', 'August', 'September', 'October', 'November', 'December'];
      const containsMonth = months.some(month => subject.includes(month));
      expect(containsMonth).toBe(true);
    });
  });

  /**
   * Property 8.2: Weekly review subject indicates review type
   * **Validates: Requirement 6.3**
   */
  describe('Property 8.2: Weekly review subject indicates review type', () => {
    it('should include "Weekly Review" in subject', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (email, content) => {
            sentEmails = []; // Clear before each iteration
            const mailer = new DigestMailer(mockSmtpSender);
            await mailer.sendWeeklyReview(email, content);

            expect(sentEmails.length).toBe(1);
            expect(sentEmails[0].subject).toContain('Weekly Review');
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should include date range in weekly review subject', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') }),
          async (endDate) => {
            const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
            const mailer = new DigestMailer(mockSmtpSender);
            const subject = mailer.formatWeeklySubject(startDate, endDate);

            // Should contain "to" indicating a range
            expect(subject).toContain(' to ');
            
            // Should contain abbreviated month names
            const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                                 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const containsMonth = shortMonths.some(month => subject.includes(month));
            expect(containsMonth).toBe(true);
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  /**
   * Property 8.3: Digest body contains provided content
   * **Validates: Requirements 6.2, 6.3**
   */
  describe('Property 8.3: Digest body contains provided content', () => {
    it('should pass content as email body for daily digest', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (email, content) => {
            sentEmails = []; // Clear before each iteration
            const mailer = new DigestMailer(mockSmtpSender);
            await mailer.sendDailyDigest(email, content);

            expect(sentEmails.length).toBe(1);
            expect(sentEmails[0].text).toBe(content);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should pass content as email body for weekly review', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 1000 }),
          async (email, content) => {
            sentEmails = []; // Clear before each iteration
            const mailer = new DigestMailer(mockSmtpSender);
            await mailer.sendWeeklyReview(email, content);

            expect(sentEmails.length).toBe(1);
            expect(sentEmails[0].text).toBe(content);
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  /**
   * Property 8.4: Digest emails have no In-Reply-To header (new thread)
   * **Validates: Requirement 6.4**
   */
  describe('Property 8.4: Digest emails have no In-Reply-To header', () => {
    it('should not set inReplyTo for daily digest', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (email, content) => {
            sentEmails = []; // Clear before each iteration
            const mailer = new DigestMailer(mockSmtpSender);
            await mailer.sendDailyDigest(email, content);

            expect(sentEmails.length).toBe(1);
            expect(sentEmails[0].inReplyTo).toBeUndefined();
            expect(sentEmails[0].references).toBeUndefined();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('should not set inReplyTo for weekly review', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (email, content) => {
            sentEmails = []; // Clear before each iteration
            const mailer = new DigestMailer(mockSmtpSender);
            await mailer.sendWeeklyReview(email, content);

            expect(sentEmails.length).toBe(1);
            expect(sentEmails[0].inReplyTo).toBeUndefined();
            expect(sentEmails[0].references).toBeUndefined();
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  /**
   * Property 8.5: Digest emails skip silently when disabled
   * **Validates: Requirement 6.5**
   */
  describe('Property 8.5: Digest emails skip silently when disabled', () => {
    it('should return skipped=true when email is disabled', async () => {
      // Create mock that reports unavailable
      const disabledSmtpSender = {
        isAvailable: jest.fn().mockReturnValue(false),
        sendEmail: jest.fn(),
        sendReply: jest.fn(),
      } as unknown as SmtpSender;

      await fc.assert(
        fc.asyncProperty(
          fc.emailAddress(),
          fc.string({ minLength: 1, maxLength: 500 }),
          async (email, content) => {
            const mailer = new DigestMailer(disabledSmtpSender);
            
            const dailyResult = await mailer.sendDailyDigest(email, content);
            expect(dailyResult.success).toBe(true);
            expect(dailyResult.skipped).toBe(true);
            
            const weeklyResult = await mailer.sendWeeklyReview(email, content);
            expect(weeklyResult.success).toBe(true);
            expect(weeklyResult.skipped).toBe(true);

            // Should not have called sendEmail
            expect(disabledSmtpSender.sendEmail).not.toHaveBeenCalled();
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

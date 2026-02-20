/**
 * Digest Mailer Service
 * Handles email delivery of daily digests and weekly reviews.
 * 
 * Features:
 * - Sends daily digest emails
 * - Sends weekly review emails
 * - Skips silently when email is disabled
 * - Sends as new thread (no In-Reply-To header)
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { getEmailConfig, EmailConfig } from '../config/email';
import { getSmtpSender, SmtpSender, SendEmailResult } from './smtp-sender';

// ============================================
// Types and Interfaces
// ============================================

/**
 * Options for sending a digest email
 */
export interface DigestEmailOptions {
  to: string;
  content: string;
}

/**
 * Result of a digest email send operation
 */
export interface DigestEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  skipped?: boolean;
}

/**
 * Interface for the DigestMailer service
 */
export interface IDigestMailer {
  /**
   * Check if email delivery is available
   */
  isAvailable(): boolean;

  /**
   * Send a daily digest email
   */
  sendDailyDigest(to: string, content: string): Promise<DigestEmailResult>;

  /**
   * Send a weekly review email
   */
  sendWeeklyReview(to: string, content: string): Promise<DigestEmailResult>;

  /**
   * Format a daily digest email subject
   */
  formatDailySubject(): string;

  /**
   * Format a weekly review email subject
   */
  formatWeeklySubject(startDate: Date, endDate: Date): string;
}

// ============================================
// DigestMailer Class
// ============================================

export class DigestMailer implements IDigestMailer {
  private config: EmailConfig;
  private smtpSender: SmtpSender;

  constructor(smtpSender?: SmtpSender) {
    this.config = getEmailConfig();
    this.smtpSender = smtpSender || getSmtpSender();
  }

  /**
   * Check if email delivery is available
   * 
   * @returns true if email is enabled and SMTP is configured
   */
  isAvailable(): boolean {
    return this.config.enabled && this.smtpSender.isAvailable();
  }

  /**
   * Format a daily digest email subject
   * 
   * Requirements: 6.2
   * 
   * @returns Subject line for daily digest
   */
  formatDailySubject(): string {
    const today = new Date();
    const dateStr = today.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
    return `JustDo.so Daily Digest - ${dateStr}`;
  }

  /**
   * Format a weekly review email subject
   * 
   * Requirements: 6.3
   * 
   * @param startDate - Start of the week
   * @param endDate - End of the week
   * @returns Subject line for weekly review
   */
  formatWeeklySubject(startDate: Date, endDate: Date): string {
    const formatDate = (d: Date) =>
      d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    return `JustDo.so Weekly Review - ${formatDate(startDate)} to ${formatDate(endDate)}`;
  }

  /**
   * Send a daily digest email
   * 
   * Skips silently when email is disabled (Requirement 6.5).
   * Sends as new thread without In-Reply-To header (Requirement 6.4).
   * 
   * Requirements: 6.1, 6.2, 6.4, 6.5
   * 
   * @param to - Recipient email address
   * @param content - Digest content (markdown)
   * @returns DigestEmailResult with success status
   */
  async sendDailyDigest(to: string, content: string): Promise<DigestEmailResult> {
    // Skip silently when email is disabled (Requirement 6.5)
    if (!this.isAvailable()) {
      return {
        success: true,
        skipped: true,
      };
    }

    const subject = this.formatDailySubject();

    // Send as new thread - no In-Reply-To or References headers (Requirement 6.4)
    const result = await this.smtpSender.sendEmail({
      to,
      subject,
      text: content,
    });

    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    };
  }

  /**
   * Send a weekly review email
   * 
   * Skips silently when email is disabled (Requirement 6.5).
   * Sends as new thread without In-Reply-To header (Requirement 6.4).
   * 
   * Requirements: 6.1, 6.3, 6.4, 6.5
   * 
   * @param to - Recipient email address
   * @param content - Review content (markdown)
   * @param startDate - Optional start date for subject (defaults to 7 days ago)
   * @param endDate - Optional end date for subject (defaults to today)
   * @returns DigestEmailResult with success status
   */
  async sendWeeklyReview(
    to: string,
    content: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DigestEmailResult> {
    // Skip silently when email is disabled (Requirement 6.5)
    if (!this.isAvailable()) {
      return {
        success: true,
        skipped: true,
      };
    }

    // Default to last 7 days if dates not provided
    const end = endDate || new Date();
    const start = startDate || new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const subject = this.formatWeeklySubject(start, end);

    // Send as new thread - no In-Reply-To or References headers (Requirement 6.4)
    const result = await this.smtpSender.sendEmail({
      to,
      subject,
      text: content,
    });

    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let digestMailerInstance: DigestMailer | null = null;

/**
 * Get the DigestMailer singleton instance
 */
export function getDigestMailer(): DigestMailer {
  if (!digestMailerInstance) {
    digestMailerInstance = new DigestMailer();
  }
  return digestMailerInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetDigestMailer(): void {
  digestMailerInstance = null;
}

/**
 * SMTP Sender Service
 * Handles outbound email delivery via SMTP using nodemailer.
 * 
 * Handles:
 * - Initializing nodemailer transporter from EmailConfig
 * - Sending generic emails
 * - Sending reply emails with proper threading headers (In-Reply-To, References)
 * - Graceful error handling (log and return error result, don't throw)
 * 
 * Requirements: 5.1, 5.3, 5.6
 */

import nodemailer, { Transporter } from 'nodemailer';
import { getEmailConfig, EmailConfig } from '../config/email';

// ============================================
// Types and Interfaces
// ============================================

/**
 * Options for sending an email
 */
export interface SendEmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
}

/**
 * Result of an email send operation
 */
export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Interface for the SmtpSender service
 */
export interface ISmtpSender {
  /**
   * Check if SMTP is available for sending
   */
  isAvailable(): boolean;

  /**
   * Send a generic email
   */
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;

  /**
   * Send a reply email with proper threading headers
   */
  sendReply(
    to: string,
    subject: string,
    text: string,
    originalMessageId: string,
    references?: string[],
    html?: string
  ): Promise<SendEmailResult>;
}

// ============================================
// Custom Errors
// ============================================

/**
 * Error thrown when SMTP send fails
 * Note: This is used internally for logging, but we return error results
 * instead of throwing to callers (Requirement 5.6)
 */
export class SmtpSendError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(`SMTP send failed: ${message}`);
    this.name = 'SmtpSendError';
  }
}

// ============================================
// SmtpSender Class
// ============================================

export class SmtpSender implements ISmtpSender {
  private transporter: Transporter | null = null;
  private config: EmailConfig;

  constructor() {
    this.config = getEmailConfig();
    this.initializeTransporter();
  }

  /**
   * Initialize the nodemailer transporter from EmailConfig
   * Only creates transporter if SMTP is configured
   */
  private initializeTransporter(): void {
    if (!this.config.smtp) {
      console.warn('SmtpSender: SMTP not configured, email sending disabled');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host: this.config.smtp.host,
        port: this.config.smtp.port,
        secure: this.config.smtp.secure, // true for 465, false for other ports
        auth: {
          user: this.config.smtp.user,
          pass: this.config.smtp.pass,
        },
      });
    } catch (error) {
      console.error('SmtpSender: Failed to create transporter:', error);
      this.transporter = null;
    }
  }

  /**
   * Verify SMTP connection and authentication
   * 
   * Tests connectivity to the SMTP server and validates credentials.
   * This should be called at startup to catch configuration issues early.
   * 
   * @returns Promise resolving to true if connection is successful, false otherwise
   */
  async verify(): Promise<{ success: boolean; error?: string }> {
    if (!this.transporter || !this.config.smtp) {
      return { success: false, error: 'SMTP not configured' };
    }

    try {
      await this.transporter.verify();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check if SMTP is available for sending
   * 
   * @returns true if SMTP is configured and transporter is initialized
   */
  isAvailable(): boolean {
    return this.transporter !== null && this.config.smtp !== null;
  }

  /**
   * Send a generic email
   * 
   * Handles send failures gracefully by logging and returning error result.
   * Does not throw exceptions to callers.
   * 
   * Requirements: 5.1, 5.6
   * 
   * @param options - Email sending options
   * @returns SendEmailResult with success status and messageId or error
   */
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    if (!this.isAvailable() || !this.config.smtp) {
      console.warn('SmtpSender: Cannot send email - SMTP not available');
      return {
        success: false,
        error: 'SMTP not configured or unavailable',
      };
    }

    try {
      const mailOptions: nodemailer.SendMailOptions = {
        from: this.config.smtp.user,
        to: options.to,
        subject: options.subject,
        text: options.text,
      };

      // Add HTML if provided
      if (options.html) {
        mailOptions.html = options.html;
      }

      // Add threading headers if provided (Requirement 5.3)
      if (options.inReplyTo) {
        mailOptions.inReplyTo = options.inReplyTo;
      }

      if (options.references && options.references.length > 0) {
        mailOptions.references = options.references;
      }

      const info = await this.transporter!.sendMail(mailOptions);

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      // Log the error with details (Requirement 5.6)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('SmtpSender: Failed to send email:', {
        to: options.to,
        subject: options.subject,
        error: errorMessage,
      });

      // Return failure result instead of throwing (Requirement 5.6)
      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Send a reply email with proper threading headers
   * 
   * Sets In-Reply-To and References headers to maintain email thread continuity.
   * This ensures email clients properly group the reply with the original message.
   * 
   * Requirements: 5.3, 5.6
   * 
   * @param to - Recipient email address
   * @param subject - Email subject (should include Re: prefix and thread ID)
   * @param text - Plain text body
   * @param originalMessageId - Message-ID of the email being replied to
   * @param references - Optional array of Message-IDs for the thread
   * @param html - Optional HTML body
   * @returns SendEmailResult with success status and messageId or error
   */
  async sendReply(
    to: string,
    subject: string,
    text: string,
    originalMessageId: string,
    references?: string[],
    html?: string
  ): Promise<SendEmailResult> {
    // Build references array: include all previous references plus the original message
    const allReferences = references ? [...references] : [];
    if (!allReferences.includes(originalMessageId)) {
      allReferences.push(originalMessageId);
    }

    return this.sendEmail({
      to,
      subject,
      text,
      html,
      inReplyTo: originalMessageId,
      references: allReferences,
    });
  }
}

// ============================================
// Singleton Instance
// ============================================

let smtpSenderInstance: SmtpSender | null = null;

/**
 * Get the SmtpSender singleton instance
 */
export function getSmtpSender(): SmtpSender {
  if (!smtpSenderInstance) {
    smtpSenderInstance = new SmtpSender();
  }
  return smtpSenderInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetSmtpSender(): void {
  smtpSenderInstance = null;
}

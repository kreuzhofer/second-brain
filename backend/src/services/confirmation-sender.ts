/**
 * Confirmation Sender Service
 * Handles sending confirmation emails after entry creation from inbound emails.
 * 
 * Handles:
 * - Formatting confirmation email content with entry details
 * - Including entry name, category, and confidence score
 * - Including clarification instructions for low-confidence entries (routed to inbox)
 * - Including thread ID in subject and body footer
 * - Sending confirmation emails via SmtpSender
 * 
 * Requirements: 5.2, 5.4, 5.5
 */

import { getSmtpSender, SmtpSender, SendEmailResult } from './smtp-sender';
import { getThreadTracker, ThreadTracker } from './thread-tracker';
import { Category } from '../types/entry.types';

// ============================================
// Types and Interfaces
// ============================================

/**
 * Entry information needed for confirmation email
 */
export interface ConfirmationEntryInfo {
  name: string;
  category: Category;
  confidence: number;
}

/**
 * Parameters for sending a confirmation email
 */
export interface SendConfirmationParams {
  /** Recipient email address */
  to: string;
  /** Original email subject (without thread ID) */
  originalSubject: string;
  /** Original email Message-ID for threading */
  originalMessageId: string;
  /** Thread ID (8 hex chars, without [SB-] wrapper) */
  threadId: string;
  /** Entry information for the confirmation message */
  entry: ConfirmationEntryInfo;
  /** Optional references for email threading */
  references?: string[];
}

/**
 * Formatted confirmation email content
 */
export interface FormattedConfirmationEmail {
  subject: string;
  body: string;
}

/**
 * Confidence threshold for low-confidence entries
 * Entries below this threshold are routed to inbox and need clarification instructions
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Interface for the ConfirmationSender service
 */
export interface IConfirmationSender {
  /**
   * Format a confirmation email with entry details
   */
  formatConfirmationEmail(
    originalSubject: string,
    threadId: string,
    entry: ConfirmationEntryInfo
  ): FormattedConfirmationEmail;

  /**
   * Send a confirmation email for a created entry
   */
  sendConfirmation(params: SendConfirmationParams): Promise<SendEmailResult>;

  /**
   * Check if confirmation sending is available
   */
  isAvailable(): boolean;
}

// ============================================
// ConfirmationSender Class
// ============================================

export class ConfirmationSender implements IConfirmationSender {
  private smtpSender: SmtpSender;
  private threadTracker: ThreadTracker;

  constructor(smtpSender?: SmtpSender, threadTracker?: ThreadTracker) {
    this.smtpSender = smtpSender ?? getSmtpSender();
    this.threadTracker = threadTracker ?? getThreadTracker();
  }

  /**
   * Check if confirmation sending is available
   * 
   * @returns true if SMTP is configured and available
   */
  isAvailable(): boolean {
    return this.smtpSender.isAvailable();
  }

  /**
   * Format a confirmation email with entry details
   * 
   * Creates the subject and body for a confirmation email including:
   * - Entry name, category, and confidence score
   * - Clarification instructions for low-confidence entries (routed to inbox)
   * - Thread ID in subject and body footer
   * 
   * Requirements: 5.2, 5.4, 5.5
   * 
   * @param originalSubject - The original email subject (without thread ID)
   * @param threadId - The 8 hex character thread ID
   * @param entry - Entry information (name, category, confidence)
   * @returns Formatted email with subject and body
   */
  formatConfirmationEmail(
    originalSubject: string,
    threadId: string,
    entry: ConfirmationEntryInfo
  ): FormattedConfirmationEmail {
    const formattedThreadId = this.threadTracker.formatThreadId(threadId);
    
    // Build subject with Re: prefix and thread ID
    // Requirement 5.4: Include thread identifier in subject
    const subject = `Re: ${originalSubject} ${formattedThreadId}`;

    // Build confirmation message body
    // Requirement 5.2: Include entry name, category, and confidence score
    const confidencePercent = Math.round(entry.confidence * 100);
    let body = `Your thought has been captured!\n\n`;
    body += `Entry: ${entry.name}\n`;
    body += `Category: ${entry.category}\n`;
    body += `Confidence: ${confidencePercent}%\n`;

    // Requirement 5.5: Include clarification instructions for low-confidence entries
    if (entry.confidence < LOW_CONFIDENCE_THRESHOLD) {
      body += `\n⚠️ This entry was routed to your inbox due to low confidence.\n`;
      body += `To reclassify, reply with a category hint like [person], [project], [idea], or [task].\n`;
      body += `For example: "[project] This should be a project"\n`;
    }

    // Add footer with thread ID
    // Requirement 5.4: Include thread ID in body footer
    body += `\n---\n`;
    body += `Thread ID: ${formattedThreadId}\n`;
    body += `Reply to this email to continue the conversation.`;

    return { subject, body };
  }

  /**
   * Send a confirmation email for a created entry
   * 
   * Sends a reply email to the original sender with entry details.
   * Uses SmtpSender to handle the actual email delivery with proper
   * threading headers (In-Reply-To, References).
   * 
   * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
   * 
   * @param params - Confirmation sending parameters
   * @returns SendEmailResult with success status and messageId or error
   */
  async sendConfirmation(params: SendConfirmationParams): Promise<SendEmailResult> {
    const { to, originalSubject, originalMessageId, threadId, entry, references } = params;

    // Format the confirmation email
    const { subject, body } = this.formatConfirmationEmail(
      originalSubject,
      threadId,
      entry
    );

    // Send as a reply to maintain email threading
    // Requirement 5.3: Send as reply with In-Reply-To header
    return this.smtpSender.sendReply(
      to,
      subject,
      body,
      originalMessageId,
      references
    );
  }
}

// ============================================
// Singleton Instance
// ============================================

let confirmationSenderInstance: ConfirmationSender | null = null;

/**
 * Get the ConfirmationSender singleton instance
 */
export function getConfirmationSender(): ConfirmationSender {
  if (!confirmationSenderInstance) {
    confirmationSenderInstance = new ConfirmationSender();
  }
  return confirmationSenderInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetConfirmationSender(): void {
  confirmationSenderInstance = null;
}

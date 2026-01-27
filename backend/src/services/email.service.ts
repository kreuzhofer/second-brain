/**
 * Email Service
 * Main service coordinating all email operations for the Second Brain application.
 * 
 * Composes:
 * - EmailParser: Parses raw email content
 * - ThreadTracker: Manages thread identification and conversation linking
 * - SmtpSender: Sends outbound emails
 * - ConfirmationSender: Sends confirmation replies
 * - ImapPoller: Polls for inbound emails
 * 
 * Requirements: 2.4, 2.5, 2.6, 9.1, 9.2, 9.3, 9.4
 */

import { getEmailConfig, EmailConfig } from '../config/email';
import { getEmailParser, ParsedEmail } from './email-parser';
import { getThreadTracker, ThreadTracker } from './thread-tracker';
import { getSmtpSender, SmtpSender, SendEmailResult } from './smtp-sender';
import { getConfirmationSender, ConfirmationSender } from './confirmation-sender';
import { getImapPoller, ImapPoller, resetImapPoller } from './imap-poller';
import { getChatService, ChatService } from './chat.service';
import { Category } from '../types/entry.types';

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
 * Result of processing an inbound email
 */
export interface ProcessResult {
  success: boolean;
  conversationId?: string;
  entryPath?: string;
  threadId?: string;
  error?: string;
}

/**
 * Interface for the EmailService
 */
export interface IEmailService {
  isEnabled(): boolean;
  sendEmail(options: SendEmailOptions): Promise<SendEmailResult>;
  sendReply(threadId: string, content: string, subject?: string): Promise<SendEmailResult>;
  processInboundEmail(email: ParsedEmail): Promise<ProcessResult>;
  startPolling(): void;
  stopPolling(): void;
}

// ============================================
// EmailService Class
// ============================================

export class EmailService implements IEmailService {
  private config: EmailConfig;
  private emailParser = getEmailParser();
  private threadTracker: ThreadTracker;
  private smtpSender: SmtpSender;
  private confirmationSender: ConfirmationSender;
  private imapPoller: ImapPoller;
  private chatService: ChatService;

  constructor(
    threadTracker?: ThreadTracker,
    smtpSender?: SmtpSender,
    confirmationSender?: ConfirmationSender,
    imapPoller?: ImapPoller,
    chatService?: ChatService
  ) {
    this.config = getEmailConfig();
    this.threadTracker = threadTracker ?? getThreadTracker();
    this.smtpSender = smtpSender ?? getSmtpSender();
    this.confirmationSender = confirmationSender ?? getConfirmationSender();
    this.imapPoller = imapPoller ?? getImapPoller();
    this.chatService = chatService ?? getChatService();

    // Wire up the email processor to handle inbound emails
    this.imapPoller.setProcessor(this.processEmailCallback.bind(this));
  }

  /**
   * Check if email is enabled
   * 
   * Returns true only if both SMTP and IMAP are configured.
   * 
   * Requirement 9.1: Check configuration status
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Send an email
   * 
   * Delegates to SmtpSender for actual delivery.
   */
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    if (!this.config.smtp) {
      return {
        success: false,
        error: 'SMTP not configured',
      };
    }

    return this.smtpSender.sendEmail(options);
  }

  /**
   * Send a reply to an existing thread
   * 
   * Looks up the thread by ID and sends a reply with proper headers.
   */
  async sendReply(
    threadId: string,
    content: string,
    subject?: string
  ): Promise<SendEmailResult> {
    if (!this.config.smtp) {
      return {
        success: false,
        error: 'SMTP not configured',
      };
    }

    // Find the original thread
    const thread = await this.threadTracker.findByThreadId(threadId);
    if (!thread) {
      return {
        success: false,
        error: `Thread not found: ${threadId}`,
      };
    }

    // Build reply subject
    const replySubject = subject || `Re: ${thread.subject}`;

    // Send reply with proper threading headers
    return this.smtpSender.sendReply(
      thread.fromAddress,
      replySubject,
      content,
      thread.messageId,
      [thread.messageId]
    );
  }

  /**
   * Process a single inbound email
   * 
   * This is the main entry point for handling incoming emails.
   * It orchestrates:
   * 1. Thread ID extraction/generation
   * 2. Conversation lookup/creation
   * 3. Message processing via ChatService
   * 4. Confirmation email sending
   * 
   * Requirements:
   * - 2.4: Wire inbound emails to ChatService
   * - 2.5: Mark processed emails as read (handled by ImapPoller)
   * - 2.6: Handle course correction via email reply
   * - 9.2: Process inbound email flow
   * - 9.3: Send confirmation replies
   * - 9.4: Handle course correction flow
   */
  async processInboundEmail(email: ParsedEmail): Promise<ProcessResult> {
    return this.processEmail(email);
  }

  /**
   * Process inbound email and return boolean for ImapPoller callback
   */
  private async processEmailCallback(email: ParsedEmail): Promise<boolean> {
    const result = await this.processEmail(email);
    return result.success;
  }

  /**
   * Internal method to process an email with full result details
   */
  private async processEmail(email: ParsedEmail): Promise<ProcessResult> {
    try {
      // 1. Check for duplicate by Message-ID
      const existing = await this.threadTracker.getByMessageId(email.messageId);
      if (existing) {
        console.log(`EmailService: Skipping duplicate email: ${email.messageId}`);
        return {
          success: true,
          conversationId: existing.conversationId,
          threadId: existing.threadId,
        };
      }

      // 2. Extract thread ID from subject or body
      const extractedThreadId = this.emailParser.extractThreadId(
        email.subject,
        email.text || ''
      );

      // 3. Find existing conversation or create new one
      let conversationId: string | null = null;
      let threadId: string;

      if (extractedThreadId) {
        // This is a reply to an existing thread
        conversationId = await this.threadTracker.findConversation(extractedThreadId);
        threadId = extractedThreadId;
      }

      if (!conversationId) {
        // New conversation - generate new thread ID
        threadId = extractedThreadId || this.threadTracker.generateThreadId();
      } else {
        threadId = extractedThreadId!;
      }

      // 4. Extract category hint from subject
      const hint = this.emailParser.extractHint(email.subject);

      // 5. Extract clean text content
      let cleanText = this.emailParser.extractText(email);
      
      // Check if the extracted text is just signature/boilerplate
      // Common patterns: starts with signature marker, contains only contact info
      const isOnlySignature = cleanText.length < 10 || 
        /^\[signature_\d+\]/i.test(cleanText) ||
        /^Daniel Kreuzhofer/i.test(cleanText.trim()) ||
        cleanText.trim().startsWith('[signature');
      
      // If body is empty or just signature, use subject as content
      // Remove the hint bracket from subject if present
      if (isOnlySignature) {
        let subjectContent = email.subject;
        if (hint) {
          // Remove the hint from subject (e.g., "[admin] " -> "")
          subjectContent = subjectContent.replace(/^\[(?:person|project|idea|task)\]\s*/i, '');
        }
        cleanText = subjectContent.trim();
        console.log(`EmailService: Body is signature only, using subject as content: "${cleanText}"`);
      }
      
      console.log(`EmailService: Final text (${cleanText.length} chars): ${cleanText.substring(0, 200)}...`);

      // 6. Process message via ChatService
      const chatResponse = await this.chatService.processMessage(
        conversationId,
        cleanText,
        hint?.category
      );

      // 7. Create thread record
      await this.threadTracker.createThread({
        messageId: email.messageId,
        threadId,
        inReplyTo: email.inReplyTo,
        subject: email.subject,
        fromAddress: email.from.address,
        conversationId: chatResponse.conversationId,
      });

      // 8. Send confirmation or clarification email
      console.log(`EmailService: chatResponse.entry = ${JSON.stringify(chatResponse.entry)}`);
      console.log(`EmailService: chatResponse.message.content = ${chatResponse.message?.content?.substring(0, 100)}...`);
      
      if (chatResponse.entry) {
        // Entry was created - send confirmation
        console.log(`EmailService: Sending confirmation for entry ${chatResponse.entry.name}`);
        await this.confirmationSender.sendConfirmation({
          to: email.from.address,
          originalSubject: email.subject,
          originalMessageId: email.messageId,
          threadId,
          entry: {
            name: chatResponse.entry.name,
            category: chatResponse.entry.category,
            confidence: chatResponse.entry.confidence,
          },
        });
      } else if (chatResponse.message?.content) {
        // No entry created but LLM has a response (clarification needed)
        // Send the LLM's response as a reply
        console.log(`EmailService: Sending clarification reply for thread ${threadId}`);
        const result = await this.smtpSender.sendReply(
          email.from.address,
          `Re: ${email.subject} [SB-${threadId}]`,
          `${chatResponse.message.content}\n\n---\nThread ID: [SB-${threadId}]`,
          email.messageId,
          [email.messageId]
        );
        if (!result.success) {
          console.error(`EmailService: Failed to send clarification email: ${result.error}`);
        }
      }

      return {
        success: true,
        conversationId: chatResponse.conversationId,
        entryPath: chatResponse.entry?.path,
        threadId,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error(`EmailService: Error processing email ${email.messageId}:`, error);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }

  /**
   * Start the IMAP polling loop
   * 
   * Delegates to ImapPoller.
   */
  startPolling(): void {
    if (!this.config.imap) {
      console.warn('EmailService: IMAP not configured, cannot start polling');
      return;
    }
    this.imapPoller.start();
  }

  /**
   * Stop the IMAP polling loop
   * 
   * Delegates to ImapPoller.
   */
  stopPolling(): void {
    this.imapPoller.stop();
  }
}

// ============================================
// Singleton Instance
// ============================================

let emailServiceInstance: EmailService | null = null;

/**
 * Get the EmailService singleton instance
 */
export function getEmailService(): EmailService {
  if (!emailServiceInstance) {
    emailServiceInstance = new EmailService();
  }
  return emailServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetEmailService(): void {
  if (emailServiceInstance) {
    emailServiceInstance.stopPolling();
  }
  emailServiceInstance = null;
  resetImapPoller();
}

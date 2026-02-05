/**
 * Thread Tracker Service
 * Manages email thread identification and conversation linking.
 * 
 * Handles:
 * - Generating unique thread IDs in [SB-{8 hex chars}] format
 * - Creating EmailThread records in the database
 * - Finding conversations by thread ID
 * - Checking for duplicate emails by Message-ID
 * 
 * Requirements: 3.1, 3.2, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient } from '../lib/prisma';
import { requireUserId } from '../context/user-context';

// ============================================
// Types and Interfaces
// ============================================

/**
 * Parameters for creating a new email thread record
 */
export interface CreateThreadParams {
  messageId: string;
  threadId: string;
  inReplyTo?: string;
  subject: string;
  fromAddress: string;
  conversationId: string;
}

/**
 * Email thread record from the database
 */
export interface EmailThread {
  id: string;
  messageId: string;
  threadId: string;
  inReplyTo?: string;
  subject: string;
  fromAddress: string;
  conversationId: string;
  createdAt: Date;
}

/**
 * Interface for the ThreadTracker service
 */
export interface IThreadTracker {
  /**
   * Generate a new thread ID
   * Format: 8 hex characters (first 8 chars of UUID v4)
   */
  generateThreadId(): string;

  /**
   * Format thread ID for inclusion in emails
   * Returns: [SB-{threadId}]
   */
  formatThreadId(threadId: string): string;

  /**
   * Create thread record linking email to conversation
   */
  createThread(params: CreateThreadParams): Promise<EmailThread>;

  /**
   * Find conversation by thread ID
   * Returns the conversationId if found, null otherwise
   */
  findConversation(threadId: string): Promise<string | null>;

  /**
   * Get thread by Message-ID to check for duplicates
   */
  getByMessageId(messageId: string): Promise<EmailThread | null>;
}

// ============================================
// ThreadTracker Class
// ============================================

export class ThreadTracker implements IThreadTracker {
  private prisma = getPrismaClient();

  private getUserId(): string {
    return requireUserId();
  }

  /**
   * Generate a new thread ID
   * 
   * Creates a unique identifier using the first 8 characters of a UUID v4.
   * This provides sufficient uniqueness while keeping the ID short enough
   * to not clutter email subject lines.
   * 
   * Requirement 3.1: Generate unique thread identifier in format [SB-{uuid}]
   * 
   * @returns 8 hex character string
   */
  generateThreadId(): string {
    const uuid = uuidv4();
    // Extract first 8 characters (removing hyphens)
    return uuid.replace(/-/g, '').substring(0, 8).toLowerCase();
  }

  /**
   * Format thread ID for inclusion in emails
   * 
   * Wraps the thread ID in the standard format [SB-{threadId}]
   * This format is used in both subject lines and email body footers.
   * 
   * Requirement 3.2: Include thread identifier in subject line and email body footer
   * 
   * @param threadId - The 8 hex character thread ID
   * @returns Formatted thread ID string: [SB-{threadId}]
   */
  formatThreadId(threadId: string): string {
    return `[SB-${threadId}]`;
  }

  /**
   * Create thread record linking email to conversation
   * 
   * Stores an EmailThread record in the database with all relevant
   * email metadata and the linked conversation ID.
   * 
   * Requirements:
   * - 4.1: Create EmailThread record with Message-ID header
   * - 4.2: Store threadId linking related emails
   * - 4.3: Store In-Reply-To header for threading
   * - 4.4: Store subject, sender address, and conversationId
   * 
   * @param params - Thread creation parameters
   * @returns The created EmailThread record
   */
  async createThread(params: CreateThreadParams): Promise<EmailThread> {
    const userId = this.getUserId();
    const thread = await this.prisma.emailThread.create({
      data: {
        userId,
        messageId: params.messageId,
        threadId: params.threadId,
        inReplyTo: params.inReplyTo,
        subject: params.subject,
        fromAddress: params.fromAddress,
        conversationId: params.conversationId,
      },
    });

    return this.mapEmailThread(thread);
  }

  /**
   * Find conversation by thread ID
   * 
   * Looks up the most recent EmailThread record with the given threadId
   * and returns the associated conversationId.
   * 
   * Requirements:
   * - 3.5: Link email to existing conversation when thread ID found
   * - 4.5: Query by threadId to find related messages
   * 
   * @param threadId - The 8 hex character thread ID
   * @returns The conversationId if found, null otherwise
   */
  async findConversation(threadId: string): Promise<string | null> {
    const userId = this.getUserId();
    const thread = await this.prisma.emailThread.findFirst({
      where: { threadId, userId },
      orderBy: { createdAt: 'desc' },
    });

    return thread?.conversationId ?? null;
  }

  /**
   * Get thread by Message-ID to check for duplicates
   * 
   * Looks up an EmailThread record by the email's Message-ID header.
   * This is used to prevent processing the same email twice.
   * 
   * Requirement 7.5: Not process the same email twice (track by Message-ID)
   * 
   * @param messageId - The email's Message-ID header
   * @returns The EmailThread record if found, null otherwise
   */
  async getByMessageId(messageId: string): Promise<EmailThread | null> {
    const userId = this.getUserId();
    const thread = await this.prisma.emailThread.findFirst({
      where: { messageId, userId },
    });

    if (!thread) {
      return null;
    }

    return this.mapEmailThread(thread);
  }

  /**
   * Find thread by thread ID
   * 
   * Looks up the most recent EmailThread record with the given threadId.
   * Used for sending replies to existing threads.
   * 
   * @param threadId - The 8 hex character thread ID
   * @returns The EmailThread record if found, null otherwise
   */
  async findByThreadId(threadId: string): Promise<EmailThread | null> {
    const userId = this.getUserId();
    const thread = await this.prisma.emailThread.findFirst({
      where: { threadId, userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!thread) {
      return null;
    }

    return this.mapEmailThread(thread);
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Map Prisma EmailThread to domain EmailThread type
   */
  private mapEmailThread(thread: {
    id: string;
    messageId: string;
    threadId: string;
    inReplyTo: string | null;
    subject: string;
    fromAddress: string;
    conversationId: string;
    createdAt: Date;
  }): EmailThread {
    return {
      id: thread.id,
      messageId: thread.messageId,
      threadId: thread.threadId,
      inReplyTo: thread.inReplyTo ?? undefined,
      subject: thread.subject,
      fromAddress: thread.fromAddress,
      conversationId: thread.conversationId,
      createdAt: thread.createdAt,
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let threadTrackerInstance: ThreadTracker | null = null;

/**
 * Get the ThreadTracker singleton instance
 */
export function getThreadTracker(): ThreadTracker {
  if (!threadTrackerInstance) {
    threadTrackerInstance = new ThreadTracker();
  }
  return threadTrackerInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetThreadTracker(): void {
  threadTrackerInstance = null;
}

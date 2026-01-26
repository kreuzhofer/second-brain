/**
 * Conversation Service
 * Manages conversation state in PostgreSQL including messages and summaries.
 * Implements CRUD operations for conversations, messages, and conversation summaries.
 */

import { getPrismaClient } from '../lib/prisma';
import {
  Conversation,
  Message,
  ConversationSummary,
} from '../types/chat.types';
import { Channel } from '../types/entry.types';

// Role type matching Prisma enum
export type Role = 'user' | 'assistant';

// ============================================
// Custom Errors
// ============================================

export class ConversationNotFoundError extends Error {
  constructor(id: string) {
    super(`Conversation not found: ${id}`);
    this.name = 'ConversationNotFoundError';
  }
}

export class MessageNotFoundError extends Error {
  constructor(id: string) {
    super(`Message not found: ${id}`);
    this.name = 'MessageNotFoundError';
  }
}

// ============================================
// Conversation Service Class
// ============================================

export class ConversationService {
  private prisma = getPrismaClient();

  /**
   * Create a new conversation
   * @param channel - The channel for the conversation (chat, email, api)
   * @param externalId - Optional external identifier (e.g., email thread ID)
   * @returns The created conversation
   */
  async create(channel: Channel, externalId?: string): Promise<Conversation> {
    const conversation = await this.prisma.conversation.create({
      data: {
        channel,
        externalId,
      },
    });

    return this.mapConversation(conversation);
  }

  /**
   * Get a conversation by ID
   * @param id - The conversation ID
   * @returns The conversation or null if not found
   */
  async getById(id: string): Promise<Conversation | null> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id },
    });

    if (!conversation) {
      return null;
    }

    return this.mapConversation(conversation);
  }

  /**
   * Get the most recent conversation for a channel
   * @param channel - The channel to search
   * @returns The most recent conversation or null if none exists
   */
  async getMostRecent(channel: Channel): Promise<Conversation | null> {
    const conversation = await this.prisma.conversation.findFirst({
      where: { channel },
      orderBy: { updatedAt: 'desc' },
    });

    if (!conversation) {
      return null;
    }

    return this.mapConversation(conversation);
  }

  /**
   * List conversations with pagination
   * @param limit - Maximum number of conversations to return
   * @param offset - Number of conversations to skip
   * @returns Array of conversations ordered by most recent first
   */
  async list(limit: number = 20, offset: number = 0): Promise<Conversation[]> {
    const conversations = await this.prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    return conversations.map((c: {
      id: string;
      channel: string;
      externalId: string | null;
      createdAt: Date;
      updatedAt: Date;
    }) => this.mapConversation(c));
  }

  /**
   * Add a message to a conversation
   * @param conversationId - The conversation ID
   * @param role - The message role (user or assistant)
   * @param content - The message content
   * @param filedEntryPath - Optional path to the filed entry
   * @param filedConfidence - Optional confidence score for the filed entry
   * @returns The created message
   */
  async addMessage(
    conversationId: string,
    role: Role,
    content: string,
    filedEntryPath?: string,
    filedConfidence?: number
  ): Promise<Message> {
    // Verify conversation exists
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new ConversationNotFoundError(conversationId);
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId,
        role,
        content,
        filedEntryPath,
        filedConfidence,
      },
    });

    // Update conversation's updatedAt timestamp
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return this.mapMessage(message);
  }

  /**
   * Get messages for a conversation
   * @param conversationId - The conversation ID
   * @param limit - Optional limit on number of messages to return
   * @returns Array of messages in chronological order
   */
  async getMessages(conversationId: string, limit?: number): Promise<Message[]> {
    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });

    return messages.map((m: {
      id: string;
      conversationId: string;
      role: string;
      content: string;
      filedEntryPath: string | null;
      filedConfidence: number | null;
      createdAt: Date;
    }) => this.mapMessage(m));
  }

  /**
   * Get the message count for a conversation
   * @param conversationId - The conversation ID
   * @returns The number of messages in the conversation
   */
  async getMessageCount(conversationId: string): Promise<number> {
    return this.prisma.message.count({
      where: { conversationId },
    });
  }

  /**
   * Get summaries for a conversation
   * @param conversationId - The conversation ID
   * @returns Array of summaries in chronological order
   */
  async getSummaries(conversationId: string): Promise<ConversationSummary[]> {
    const summaries = await this.prisma.conversationSummary.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
    });

    return summaries.map((s: {
      id: string;
      conversationId: string;
      summary: string;
      messageCount: number;
      startMessageId: string;
      endMessageId: string;
      createdAt: Date;
    }) => this.mapSummary(s));
  }

  /**
   * Add a summary to a conversation
   * @param conversationId - The conversation ID
   * @param summary - The summary text
   * @param messageCount - Number of messages covered by this summary
   * @param startMessageId - ID of the first message in the summary range
   * @param endMessageId - ID of the last message in the summary range
   * @returns The created summary
   */
  async addSummary(
    conversationId: string,
    summary: string,
    messageCount: number,
    startMessageId: string,
    endMessageId: string
  ): Promise<ConversationSummary> {
    // Verify conversation exists
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
    });

    if (!conversation) {
      throw new ConversationNotFoundError(conversationId);
    }

    const conversationSummary = await this.prisma.conversationSummary.create({
      data: {
        conversationId,
        summary,
        messageCount,
        startMessageId,
        endMessageId,
      },
    });

    return this.mapSummary(conversationSummary);
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Map Prisma Conversation to domain Conversation type
   */
  private mapConversation(conversation: {
    id: string;
    channel: string;
    externalId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): Conversation {
    return {
      id: conversation.id,
      channel: conversation.channel as Channel,
      externalId: conversation.externalId ?? undefined,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };
  }

  /**
   * Map Prisma Message to domain Message type
   */
  private mapMessage(message: {
    id: string;
    conversationId: string;
    role: string;
    content: string;
    filedEntryPath: string | null;
    filedConfidence: number | null;
    createdAt: Date;
  }): Message {
    return {
      id: message.id,
      conversationId: message.conversationId,
      role: message.role as 'user' | 'assistant',
      content: message.content,
      filedEntryPath: message.filedEntryPath ?? undefined,
      filedConfidence: message.filedConfidence ?? undefined,
      createdAt: message.createdAt,
    };
  }

  /**
   * Map Prisma ConversationSummary to domain ConversationSummary type
   */
  private mapSummary(summary: {
    id: string;
    conversationId: string;
    summary: string;
    messageCount: number;
    startMessageId: string;
    endMessageId: string;
    createdAt: Date;
  }): ConversationSummary {
    return {
      id: summary.id,
      conversationId: summary.conversationId,
      summary: summary.summary,
      messageCount: summary.messageCount,
      startMessageId: summary.startMessageId,
      endMessageId: summary.endMessageId,
      createdAt: summary.createdAt,
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let conversationServiceInstance: ConversationService | null = null;

/**
 * Get the ConversationService singleton instance
 */
export function getConversationService(): ConversationService {
  if (!conversationServiceInstance) {
    conversationServiceInstance = new ConversationService();
  }
  return conversationServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetConversationService(): void {
  conversationServiceInstance = null;
}

/**
 * Summarization Service
 * Generates conversation summaries when conversations exceed the threshold.
 * Uses OpenAI API to create summaries that capture key topics, decisions, and user preferences.
 */

import OpenAI from 'openai';
import { getConfig } from '../config/env';
import { Message, ConversationSummary } from '../types/chat.types';
import {
  ConversationService,
  getConversationService,
  ConversationNotFoundError,
} from './conversation.service';

// ============================================
// Constants
// ============================================

/**
 * System prompt for generating conversation summaries
 * Based on the product vision specification
 */
const SUMMARIZATION_PROMPT = `Summarize this conversation segment for future context. Include:
- Key topics discussed
- Decisions made (e.g., "user wants X filed as Y")
- User preferences learned (e.g., "prefers brief confirmations")
- Any corrections user made to classifications

Be concise. This will be prepended to future conversations.`;

// ============================================
// Custom Errors
// ============================================

export class SummarizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SummarizationError';
  }
}

export class OpenAIError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'OpenAIError';
  }
}

// ============================================
// Summarization Service Class
// ============================================

export class SummarizationService {
  private openai: OpenAI;
  private conversationService: ConversationService;
  private model: string;

  constructor(
    openaiClient?: OpenAI,
    conversationService?: ConversationService
  ) {
    const config = getConfig();
    this.openai = openaiClient ?? new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.conversationService = conversationService ?? getConversationService();
    this.model = config.OPENAI_MODEL_SUMMARIZATION || 'gpt-4o-mini';
  }

  /**
   * Check if summarization is needed and perform it if threshold is exceeded.
   * 
   * Property 13: Summarization Trigger
   * When a conversation exceeds (MAX_VERBATIM_MESSAGES + SUMMARIZE_BATCH_SIZE) in message count,
   * the system SHALL create a ConversationSummary covering the oldest batch
   * (excluding the most recent MAX_VERBATIM_MESSAGES).
   * 
   * @param conversationId - The conversation ID to check and potentially summarize
   * @throws ConversationNotFoundError if conversation doesn't exist
   * @throws SummarizationError if summarization fails
   */
  async checkAndSummarize(conversationId: string): Promise<void> {
    const config = getConfig();
    const { SUMMARIZE_BATCH_SIZE, MAX_VERBATIM_MESSAGES } = config;

    // Get total message count
    const messageCount = await this.conversationService.getMessageCount(conversationId);

    // Check if we've exceeded the threshold (max verbatim + batch size)
    if (messageCount <= MAX_VERBATIM_MESSAGES + SUMMARIZE_BATCH_SIZE) {
      return; // No summarization needed
    }

    // Get existing summaries to determine what's already been summarized
    const existingSummaries = await this.conversationService.getSummaries(conversationId);

    // Get all messages for the conversation
    const allMessages = await this.conversationService.getMessages(conversationId);

    if (allMessages.length === 0) {
      return; // No messages to summarize
    }

    // Determine which messages have already been summarized
    let lastSummarizedMessageId: string | null = null;
    if (existingSummaries.length > 0) {
      // Get the end message ID from the most recent summary
      lastSummarizedMessageId = existingSummaries[existingSummaries.length - 1].endMessageId;
    }

    // Find the index of the last summarized message
    let startIndex = 0;
    if (lastSummarizedMessageId) {
      const lastSummarizedIndex = allMessages.findIndex(
        (m) => m.id === lastSummarizedMessageId
      );
      if (lastSummarizedIndex !== -1) {
        startIndex = lastSummarizedIndex + 1;
      }
    }

    // Calculate how many messages are eligible to summarize
    // We summarize in fixed-size batches, excluding the most recent MAX_VERBATIM_MESSAGES
    const eligibleEndIndex = allMessages.length - MAX_VERBATIM_MESSAGES;

    // Check if there are enough messages to summarize a full batch
    const availableToSummarize = eligibleEndIndex - startIndex;
    if (availableToSummarize < SUMMARIZE_BATCH_SIZE) {
      return; // No new messages to summarize
    }

    // Summarize the oldest batch of eligible messages
    const endIndex = startIndex + SUMMARIZE_BATCH_SIZE;
    const messagesToSummarize = allMessages.slice(startIndex, endIndex);

    if (messagesToSummarize.length === 0) {
      return; // No messages to summarize
    }

    // Generate the summary
    const summaryText = await this.generateSummary(messagesToSummarize);

    // Store the summary
    const startMessageId = messagesToSummarize[0].id;
    const endMessageId = messagesToSummarize[messagesToSummarize.length - 1].id;

    await this.conversationService.addSummary(
      conversationId,
      summaryText,
      messagesToSummarize.length,
      startMessageId,
      endMessageId
    );
  }

  /**
   * Generate a summary for a batch of messages using OpenAI API.
   * 
   * Requirements 9.2: The Conversation_Summary SHALL capture key topics,
   * decisions made, and user preferences learned.
   * 
   * @param messages - Array of messages to summarize
   * @returns The generated summary text
   * @throws OpenAIError if the API call fails
   * @throws SummarizationError if no messages provided or summary generation fails
   */
  async generateSummary(messages: Message[]): Promise<string> {
    if (messages.length === 0) {
      throw new SummarizationError('Cannot generate summary for empty message array');
    }

    // Format messages for the prompt
    const formattedMessages = this.formatMessagesForPrompt(messages);

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: SUMMARIZATION_PROMPT,
          },
          {
            role: 'user',
            content: formattedMessages,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent summaries
        max_tokens: 500, // Summaries should be concise
      });

      const summary = response.choices[0]?.message?.content;

      if (!summary) {
        throw new SummarizationError('OpenAI returned empty summary');
      }

      return summary.trim();
    } catch (error) {
      if (error instanceof SummarizationError) {
        throw error;
      }

      if (error instanceof OpenAI.APIError) {
        throw new OpenAIError(
          `OpenAI API error: ${error.message}`,
          error
        );
      }

      throw new OpenAIError(
        `Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Format messages into a readable format for the summarization prompt
   * @param messages - Array of messages to format
   * @returns Formatted string representation of the conversation
   */
  private formatMessagesForPrompt(messages: Message[]): string {
    return messages
      .map((msg) => {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const timestamp = msg.createdAt.toISOString();
        let content = `[${timestamp}] ${role}: ${msg.content}`;

        // Include filing information if present
        if (msg.filedEntryPath) {
          content += ` [Filed: ${msg.filedEntryPath}`;
          if (msg.filedConfidence !== undefined) {
            content += ` (confidence: ${msg.filedConfidence.toFixed(2)})`;
          }
          content += ']';
        }

        return content;
      })
      .join('\n\n');
  }
}

// ============================================
// Singleton Instance
// ============================================

let summarizationServiceInstance: SummarizationService | null = null;

/**
 * Get the SummarizationService singleton instance
 */
export function getSummarizationService(): SummarizationService {
  if (!summarizationServiceInstance) {
    summarizationServiceInstance = new SummarizationService();
  }
  return summarizationServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetSummarizationService(): void {
  summarizationServiceInstance = null;
}

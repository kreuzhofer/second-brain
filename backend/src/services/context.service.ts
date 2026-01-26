/**
 * Context Assembler Service
 * Builds the context window for LLM calls by assembling index content,
 * conversation summaries, and recent messages.
 */

import { getConfig } from '../config/env';
import { ContextWindow, ConversationSummary, Message } from '../types/chat.types';
import { getIndexService, IndexService } from './index.service';
import { getConversationService, ConversationService } from './conversation.service';

// ============================================
// System Prompt
// ============================================

/**
 * System prompt for the classification agent
 * Defines the agent's role and expected output format
 */
export const CLASSIFICATION_SYSTEM_PROMPT = `You are a classification agent for a personal knowledge management system.

Given a raw thought, classify it into one of these categories:
- people: Information about a specific person (contact, relationship, follow-ups)
- projects: Something with multiple steps, a goal, and a timeline
- ideas: A concept, insight, or potential future thing (no active commitment yet)
- admin: A single task/errand with a due date

Extract structured fields based on the category. Return JSON only.`;

// ============================================
// Context Assembler Class
// ============================================

export class ContextAssembler {
  private indexService: IndexService;
  private conversationService: ConversationService;
  private maxVerbatimMessages: number;

  constructor(
    indexService?: IndexService,
    conversationService?: ConversationService,
    maxVerbatimMessages?: number
  ) {
    this.indexService = indexService || getIndexService();
    this.conversationService = conversationService || getConversationService();
    this.maxVerbatimMessages = maxVerbatimMessages ?? getConfig().MAX_VERBATIM_MESSAGES;
  }

  /**
   * Assemble the full context window for a conversation
   * 
   * Context Assembly Order (Property 12):
   * 1. System prompt
   * 2. Index content
   * 3. Conversation summaries (oldest to newest)
   * 4. Recent messages (oldest to newest)
   * 
   * @param conversationId - The conversation ID to assemble context for
   * @returns ContextWindow with all assembled components
   * 
   * Validates: Requirements 8.1, 8.2, 8.3, 8.4
   */
  async assemble(conversationId: string): Promise<ContextWindow> {
    // Get index.md content (Requirement 8.1)
    const indexContent = await this.indexService.getIndexContent();

    // Get conversation summaries in chronological order (Requirement 8.3)
    const summaries = await this.conversationService.getSummaries(conversationId);

    // Get recent messages, limited by MAX_VERBATIM_MESSAGES (Requirement 8.2, 8.5)
    const recentMessages = await this.getRecentMessages(conversationId);

    // Assemble context window with proper ordering (Requirement 8.4)
    return {
      systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
      indexContent,
      summaries,
      recentMessages,
    };
  }

  /**
   * Get the most recent messages for a conversation
   * Messages are returned in chronological order (oldest to newest)
   * Limited by MAX_VERBATIM_MESSAGES configuration
   * 
   * @param conversationId - The conversation ID
   * @returns Array of recent messages in chronological order
   */
  private async getRecentMessages(conversationId: string): Promise<Message[]> {
    // Get all messages for the conversation
    const allMessages = await this.conversationService.getMessages(conversationId);

    // If we have fewer messages than the limit, return all
    if (allMessages.length <= this.maxVerbatimMessages) {
      return allMessages;
    }

    // Return only the most recent N messages
    // Messages are already in chronological order from getMessages()
    return allMessages.slice(-this.maxVerbatimMessages);
  }
}

// ============================================
// Singleton Instance
// ============================================

let contextAssemblerInstance: ContextAssembler | null = null;

/**
 * Get the ContextAssembler singleton instance
 */
export function getContextAssembler(): ContextAssembler {
  if (!contextAssemblerInstance) {
    contextAssemblerInstance = new ContextAssembler();
  }
  return contextAssemblerInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetContextAssembler(): void {
  contextAssemblerInstance = null;
}

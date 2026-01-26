/**
 * Chat Service
 * Orchestrates the chat message processing flow including classification,
 * entry creation, and response generation.
 * 
 * Requirements 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4
 */

import { v4 as uuidv4 } from 'uuid';
import { getConfig } from '../config/env';
import {
  ChatResponse,
  AssistantMessage,
  CourseCorrectResponse,
  ClassificationResult,
  Conversation,
  Message,
} from '../types/chat.types';
import { Category, Channel } from '../types/entry.types';
import { ConversationService, getConversationService } from './conversation.service';
import { ContextAssembler, getContextAssembler } from './context.service';
import { ClassificationAgent, getClassificationAgent } from './classification.service';
import { SummarizationService, getSummarizationService } from './summarization.service';
import { EntryService, getEntryService } from './entry.service';
import { parseHints, formatHintsForClassifier } from '../utils/hints';
import { generateSlug } from '../utils/slug';

// ============================================
// Constants
// ============================================

/**
 * Course correction patterns
 */
const COURSE_CORRECTION_PATTERNS = [
  /actually\s+(?:that\s+)?should\s+be\s+(?:a\s+)?(\w+)/i,
  /move\s+(?:that\s+)?to\s+(\w+)/i,
  /file\s+(?:that\s+)?as\s+(?:a\s+)?(\w+)/i,
  /that'?s?\s+(?:a\s+)?(\w+)/i,
  /change\s+(?:that\s+)?to\s+(?:a\s+)?(\w+)/i,
  /reclassify\s+(?:as\s+)?(?:a\s+)?(\w+)/i,
];

/**
 * Category name mappings
 */
const CATEGORY_ALIASES: Record<string, Category> = {
  'person': 'people',
  'people': 'people',
  'project': 'projects',
  'projects': 'projects',
  'idea': 'ideas',
  'ideas': 'ideas',
  'task': 'admin',
  'admin': 'admin',
  'inbox': 'inbox',
};

// ============================================
// Custom Errors
// ============================================

export class ChatServiceError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'ChatServiceError';
  }
}

export class NoRecentEntryError extends Error {
  constructor() {
    super('No recent entry found to correct');
    this.name = 'NoRecentEntryError';
  }
}

// ============================================
// Chat Service Class
// ============================================

export class ChatService {
  private conversationService: ConversationService;
  private contextAssembler: ContextAssembler;
  private classificationAgent: ClassificationAgent;
  private summarizationService: SummarizationService;
  private entryService: EntryService;
  private confidenceThreshold: number;

  constructor(
    conversationService?: ConversationService,
    contextAssembler?: ContextAssembler,
    classificationAgent?: ClassificationAgent,
    summarizationService?: SummarizationService,
    entryService?: EntryService
  ) {
    this.conversationService = conversationService ?? getConversationService();
    this.contextAssembler = contextAssembler ?? getContextAssembler();
    this.classificationAgent = classificationAgent ?? getClassificationAgent();
    this.summarizationService = summarizationService ?? getSummarizationService();
    this.entryService = entryService ?? getEntryService();
    this.confidenceThreshold = getConfig().CONFIDENCE_THRESHOLD;
  }

  /**
   * Process a user message and return the assistant response.
   * 
   * Requirements 4.1: Classify and route based on confidence
   * Requirements 4.2: High confidence -> category folder
   * Requirements 4.3: Low confidence -> inbox with clarification
   * Requirements 4.4: Generate appropriate response
   */
  async processMessage(
    conversationId: string | null,
    message: string,
    hints?: string
  ): Promise<ChatResponse> {
    // Get or create conversation
    const conversation = conversationId
      ? await this.conversationService.getById(conversationId)
      : await this.conversationService.create('chat');

    if (!conversation) {
      throw new ChatServiceError('Failed to get or create conversation');
    }

    // Parse hints from message
    const parsedHints = parseHints(message);
    const combinedHints = hints
      ? `${hints}; ${formatHintsForClassifier(parsedHints)}`
      : formatHintsForClassifier(parsedHints);

    // Store user message
    await this.conversationService.addMessage(
      conversation.id,
      'user',
      message
    );

    // Check for course correction intent
    const courseCorrection = this.detectCourseCorrection(message);
    if (courseCorrection) {
      return this.handleCourseCorrection(
        conversation.id,
        courseCorrection.targetCategory,
        message
      );
    }

    // Assemble context for classification
    const context = await this.contextAssembler.assemble(conversation.id);

    // Classify the message
    const classification = await this.classificationAgent.classify({
      text: parsedHints.cleanedMessage || message,
      hints: combinedHints || undefined,
      context,
    });

    // Determine target folder based on confidence
    const targetCategory = this.determineTargetCategory(classification);

    // Create entry
    const entry = await this.createEntry(targetCategory, classification, message);

    // Generate response message
    const responseContent = this.generateResponseMessage(
      classification,
      targetCategory,
      entry.path
    );

    // Store assistant message with entry metadata
    const assistantMessage = await this.conversationService.addMessage(
      conversation.id,
      'assistant',
      responseContent,
      entry.path,
      classification.confidence
    );

    // Check if summarization is needed
    await this.summarizationService.checkAndSummarize(conversation.id);

    return {
      conversationId: conversation.id,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content: responseContent,
        filedEntryPath: entry.path,
        filedConfidence: classification.confidence,
        createdAt: assistantMessage.createdAt,
      },
      entry: {
        path: entry.path,
        category: targetCategory,
        name: classification.name,
        confidence: classification.confidence,
      },
      clarificationNeeded: targetCategory === 'inbox',
    };
  }

  /**
   * Get or create a conversation for a channel.
   */
  async getOrCreateConversation(channel: Channel): Promise<Conversation> {
    const existing = await this.conversationService.getMostRecent(channel);
    if (existing) {
      return existing;
    }
    return this.conversationService.create(channel);
  }

  /**
   * Handle course correction requests.
   * 
   * Requirements 6.1: Detect course correction intent
   * Requirements 6.2: Move entry to new category
   * Requirements 6.3: Transform fields
   * Requirements 6.4: Generate confirmation
   */
  async handleCourseCorrection(
    conversationId: string,
    targetCategory: Category,
    originalMessage: string
  ): Promise<ChatResponse> {
    // Find the most recent filed entry in this conversation
    const messages = await this.conversationService.getMessages(conversationId, 10);
    const recentFiledMessage = messages
      .reverse()
      .find(m => m.role === 'assistant' && m.filedEntryPath);

    if (!recentFiledMessage || !recentFiledMessage.filedEntryPath) {
      const errorMessage = "I couldn't find a recent entry to move. Could you tell me which entry you'd like to reclassify?";
      
      const assistantMessage = await this.conversationService.addMessage(
        conversationId,
        'assistant',
        errorMessage
      );

      return {
        conversationId,
        message: {
          id: assistantMessage.id,
          role: 'assistant',
          content: errorMessage,
          createdAt: assistantMessage.createdAt,
        },
        clarificationNeeded: true,
      };
    }

    try {
      // Read the existing entry
      const existingEntry = await this.entryService.read(recentFiledMessage.filedEntryPath);
      const oldCategory = existingEntry.category;

      // If already in target category, just confirm
      if (oldCategory === targetCategory) {
        const alreadyMessage = `That entry is already in ${targetCategory}. No changes needed!`;
        
        const assistantMessage = await this.conversationService.addMessage(
          conversationId,
          'assistant',
          alreadyMessage
        );

        return {
          conversationId,
          message: {
            id: assistantMessage.id,
            role: 'assistant',
            content: alreadyMessage,
            createdAt: assistantMessage.createdAt,
          },
          clarificationNeeded: false,
        };
      }

      // Transform and move the entry
      const newPath = await this.moveEntry(
        recentFiledMessage.filedEntryPath,
        targetCategory,
        existingEntry.entry
      );

      const successMessage = `Done! I've moved "${(existingEntry.entry as any).name || (existingEntry.entry as any).suggested_name}" from ${oldCategory} to ${targetCategory}. You can find it at ${newPath}.`;

      const assistantMessage = await this.conversationService.addMessage(
        conversationId,
        'assistant',
        successMessage,
        newPath
      );

      return {
        conversationId,
        message: {
          id: assistantMessage.id,
          role: 'assistant',
          content: successMessage,
          filedEntryPath: newPath,
          createdAt: assistantMessage.createdAt,
        },
        entry: {
          path: newPath,
          category: targetCategory,
          name: (existingEntry.entry as any).name || (existingEntry.entry as any).suggested_name,
          confidence: 1.0, // User explicitly requested this category
        },
        clarificationNeeded: false,
      };
    } catch (error) {
      const errorMessage = `I had trouble moving that entry: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`;
      
      const assistantMessage = await this.conversationService.addMessage(
        conversationId,
        'assistant',
        errorMessage
      );

      return {
        conversationId,
        message: {
          id: assistantMessage.id,
          role: 'assistant',
          content: errorMessage,
          createdAt: assistantMessage.createdAt,
        },
        clarificationNeeded: true,
      };
    }
  }

  /**
   * Detect if a message is a course correction request.
   * 
   * Requirements 6.1: Detect phrases like "actually that should be a [category]"
   */
  detectCourseCorrection(message: string): { targetCategory: Category } | null {
    for (const pattern of COURSE_CORRECTION_PATTERNS) {
      const match = message.match(pattern);
      if (match && match[1]) {
        const categoryName = match[1].toLowerCase();
        const targetCategory = CATEGORY_ALIASES[categoryName];
        if (targetCategory && targetCategory !== 'inbox') {
          return { targetCategory };
        }
      }
    }
    return null;
  }

  /**
   * Determine target category based on confidence threshold.
   * 
   * Requirements 4.1, 4.2: Route based on confidence
   */
  determineTargetCategory(classification: ClassificationResult): Category {
    if (classification.confidence >= this.confidenceThreshold) {
      return classification.category;
    }
    return 'inbox';
  }

  /**
   * Create an entry based on classification result.
   */
  private async createEntry(
    targetCategory: Category,
    classification: ClassificationResult,
    originalText: string
  ): Promise<{ path: string }> {
    if (targetCategory === 'inbox') {
      // Create inbox entry with needs_review status
      const entry = await this.entryService.create('inbox', {
        original_text: originalText,
        suggested_category: classification.category,
        suggested_name: classification.name,
        confidence: classification.confidence,
      } as any, 'chat');
      
      return { path: entry.path };
    }

    // Create entry in the classified category
    const entryData = this.buildEntryData(classification);
    const entry = await this.entryService.create(
      targetCategory,
      entryData,
      'chat'
    );

    return { path: entry.path };
  }

  /**
   * Build entry data from classification result.
   */
  private buildEntryData(classification: ClassificationResult): any {
    const baseData = {
      name: classification.name,
      tags: [],
      confidence: classification.confidence,
    };

    const fields = classification.fields as any;

    switch (classification.category) {
      case 'people':
        return {
          ...baseData,
          context: fields.context || '',
          follow_ups: fields.followUps || [],
          related_projects: fields.relatedProjects || [],
        };
      case 'projects':
        return {
          ...baseData,
          status: fields.status || 'active',
          next_action: fields.nextAction || '',
          related_people: fields.relatedPeople || [],
          due_date: fields.dueDate,
        };
      case 'ideas':
        return {
          ...baseData,
          one_liner: fields.oneLiner || '',
          related_projects: fields.relatedProjects || [],
        };
      case 'admin':
        return {
          ...baseData,
          status: fields.status || 'pending',
          due_date: fields.dueDate,
        };
      default:
        return baseData;
    }
  }

  /**
   * Generate response message based on classification.
   */
  private generateResponseMessage(
    classification: ClassificationResult,
    targetCategory: Category,
    entryPath: string
  ): string {
    if (targetCategory === 'inbox') {
      return `I've captured that thought but I'm not quite sure how to categorize it (${Math.round(classification.confidence * 100)}% confident it's a ${classification.category}). I've saved it to your inbox for review. You can say something like "that's a project" or "file as idea" to move it to the right place.`;
    }

    const confidencePercent = Math.round(classification.confidence * 100);
    return `Got it! I've filed "${classification.name}" as a ${targetCategory.slice(0, -1)} (${confidencePercent}% confident). You can find it at ${entryPath}.`;
  }

  /**
   * Move an entry to a new category.
   * 
   * Requirements 6.2: Move entry to new path
   * Requirements 6.3: Transform fields for new category
   */
  private async moveEntry(
    oldPath: string,
    targetCategory: Category,
    existingEntry: any
  ): Promise<string> {
    // Get the name for the new entry
    const name = existingEntry.name || existingEntry.suggested_name || 'untitled';
    const slug = generateSlug(name);
    const newPath = `${targetCategory}/${slug}.md`;

    // Transform fields for the new category
    const transformedData = this.transformFieldsForCategory(
      existingEntry,
      targetCategory
    );

    // Create new entry
    await this.entryService.create(targetCategory, transformedData, 'chat');

    // Delete old entry
    await this.entryService.delete(oldPath, 'chat');

    return newPath;
  }

  /**
   * Transform entry fields for a new category.
   * 
   * Requirements 6.3: Preserve common fields, add category-specific defaults
   */
  private transformFieldsForCategory(
    existingEntry: any,
    targetCategory: Category
  ): any {
    // Common fields to preserve
    const baseData = {
      name: existingEntry.name || existingEntry.suggested_name || 'Untitled',
      tags: existingEntry.tags || [],
    };

    switch (targetCategory) {
      case 'people':
        return {
          ...baseData,
          context: existingEntry.context || existingEntry.original_text || '',
          follow_ups: existingEntry.follow_ups || [],
          related_projects: existingEntry.related_projects || [],
        };
      case 'projects':
        return {
          ...baseData,
          status: existingEntry.status || 'active',
          next_action: existingEntry.next_action || '',
          related_people: existingEntry.related_people || [],
          due_date: existingEntry.due_date,
        };
      case 'ideas':
        return {
          ...baseData,
          one_liner: existingEntry.one_liner || existingEntry.original_text || '',
          related_projects: existingEntry.related_projects || [],
        };
      case 'admin':
        return {
          ...baseData,
          status: 'pending',
          due_date: existingEntry.due_date,
        };
      default:
        return baseData;
    }
  }
}

// ============================================
// Singleton Instance
// ============================================

let chatServiceInstance: ChatService | null = null;

/**
 * Get the ChatService singleton instance
 */
export function getChatService(): ChatService {
  if (!chatServiceInstance) {
    chatServiceInstance = new ChatService();
  }
  return chatServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetChatService(): void {
  chatServiceInstance = null;
}

// ============================================
// Utility Functions (exported for testing)
// ============================================

/**
 * Determine target folder based on confidence and threshold.
 * Exported for property testing.
 */
export function determineTargetFolder(
  confidence: number,
  threshold: number
): Category | 'inbox' {
  return confidence >= threshold ? 'category' as any : 'inbox';
}

/**
 * Tool Executor for LLM Tool Routing
 * 
 * Validates and executes tool calls against underlying services.
 * Dispatches to tool-specific handlers based on tool name.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
 */

import { ToolRegistry, getToolRegistry } from './tool-registry';
import { EntryService, getEntryService } from './entry.service';
import { ClassificationAgent, getClassificationAgent } from './classification.service';
import { DigestService, getDigestService } from './digest.service';
import { SearchService, getSearchService, SearchHit } from './search.service';
import { IndexService, getIndexService } from './index.service';
import { CLASSIFICATION_SYSTEM_PROMPT } from './context.service';
import { 
  Category, 
  EntrySummary, 
  EntryWithPath,
  CreatePeopleInput,
  CreateProjectsInput,
  CreateIdeasInput,
  CreateAdminInput
} from '../types/entry.types';
import { ContextWindow, ClassificationResult } from '../types/chat.types';

// ============================================
// Tool Call Types
// ============================================

/**
 * Represents a tool call from the LLM
 */
export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Result of executing a tool
 */
export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ============================================
// Tool-Specific Result Types
// ============================================

/**
 * Result from classify_and_capture tool
 * Requirement 3.1: Classify thought and create entry
 */
export interface CaptureResult {
  path: string;
  category: Category;
  name: string;
  confidence: number;
  clarificationNeeded: boolean;
}

/**
 * Result from list_entries tool
 * Requirement 3.2: Return matching entries with filters
 */
export interface ListEntriesResult {
  entries: EntrySummary[];
  total: number;
}

/**
 * Result from get_entry tool
 * Requirement 3.3: Return full entry details
 */
export interface GetEntryResult {
  entry: EntryWithPath;
}

/**
 * Result from generate_digest tool
 * Requirement 3.4: Generate daily or weekly digest
 */
export interface DigestResult {
  type: 'daily' | 'weekly';
  content: string;
}

/**
 * Result from update_entry tool
 * Requirement 3.5: Update entry fields
 */
export interface UpdateEntryResult {
  path: string;
  updatedFields: string[];
}

/**
 * Result from move_entry tool
 * Requirement 3.6: Move entry to different category
 */
export interface MoveEntryResult {
  oldPath: string;
  newPath: string;
  category: Category;
}

/**
 * Result from search_entries tool
 * Requirement 3.7: Search entries by keyword
 */
export interface SearchResult {
  entries: SearchHit[];
  total: number;
}

// ============================================
// Tool Executor Class
// ============================================

/**
 * Confidence threshold for routing entries to inbox vs classified category
 * Entries with confidence below this threshold go to inbox
 * Requirement 8.1: Backward compatibility with spec 002's routing behavior
 */
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Executes tool calls by dispatching to appropriate handlers
 */
export class ToolExecutor {
  private toolRegistry: ToolRegistry;
  private entryService: EntryService;
  private classificationAgent: ClassificationAgent;
  private digestService: DigestService;
  private searchService: SearchService;
  private indexService: IndexService;

  constructor(
    toolRegistry?: ToolRegistry,
    entryService?: EntryService,
    classificationAgent?: ClassificationAgent,
    digestService?: DigestService,
    searchService?: SearchService,
    indexService?: IndexService
  ) {
    this.toolRegistry = toolRegistry || getToolRegistry();
    this.entryService = entryService || getEntryService();
    this.classificationAgent = classificationAgent || getClassificationAgent();
    this.digestService = digestService || getDigestService();
    this.searchService = searchService || getSearchService();
    this.indexService = indexService || getIndexService();
  }

  /**
   * Execute a tool call and return the result
   * 
   * @param toolCall - The tool call to execute
   * @returns ToolResult with success/error status and data
   */
  async execute(toolCall: ToolCall): Promise<ToolResult> {
    const { name, arguments: args } = toolCall;

    // Validate arguments against schema
    const validation = this.toolRegistry.validateArguments(name, args);
    if (!validation.valid) {
      return {
        success: false,
        error: `Invalid arguments: ${validation.errors?.join(', ')}`
      };
    }

    // Dispatch to appropriate handler
    try {
      switch (name) {
        case 'classify_and_capture':
          return await this.handleClassifyAndCapture(args);
        
        case 'list_entries':
          return await this.handleListEntries(args);
        
        case 'get_entry':
          return await this.handleGetEntry(args);
        
        case 'generate_digest':
          return await this.handleGenerateDigest(args);
        
        case 'update_entry':
          return await this.handleUpdateEntry(args);
        
        case 'move_entry':
          return await this.handleMoveEntry(args);
        
        case 'search_entries':
          return await this.handleSearchEntries(args);
        
        default:
          return {
            success: false,
            error: `Unknown tool: ${name}`
          };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  // ============================================
  // Tool Handlers (Stubs - to be implemented in subsequent tasks)
  // ============================================

  /**
   * Handle classify_and_capture tool
   * Requirement 3.1: Classify thought and create entry using ClassificationAgent and EntryService
   * 
   * @param args - Tool arguments { text: string, hints?: string }
   * @returns ToolResult with CaptureResult data
   */
  private async handleClassifyAndCapture(args: Record<string, unknown>): Promise<ToolResult> {
    const text = args.text as string;
    const hints = args.hints as string | undefined;

    // 1. Build minimal context for classification
    // Since we don't have conversation history in this tool context,
    // we use empty summaries and messages but include the index content
    const indexContent = await this.indexService.getIndexContent();
    
    const context: ContextWindow = {
      systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
      indexContent,
      summaries: [],
      recentMessages: []
    };

    // 2. Call classificationAgent.classify()
    const classificationResult: ClassificationResult = await this.classificationAgent.classify({
      text,
      hints,
      context
    });

    // 3. Determine if entry should go to inbox (confidence < 0.6) or classified category
    // Requirement 8.1: Backward compatibility with spec 002's routing behavior
    const useInbox = classificationResult.confidence < CONFIDENCE_THRESHOLD;
    const targetCategory: Category = useInbox ? 'inbox' : classificationResult.category;

    // 4. Create entry using entryService.create()
    let createdEntry: EntryWithPath;

    if (useInbox) {
      // Create inbox entry with original text and suggested classification
      createdEntry = await this.entryService.create('inbox', {
        original_text: text,
        suggested_category: classificationResult.category,
        suggested_name: classificationResult.name,
        confidence: classificationResult.confidence,
        source_channel: 'api'
      }, 'api');
    } else {
      // Create entry in the classified category with appropriate fields
      const entryData = this.buildEntryData(classificationResult);
      createdEntry = await this.entryService.create(targetCategory, entryData, 'api');
    }

    // 5. Return CaptureResult
    const captureResult: CaptureResult = {
      path: createdEntry.path,
      category: targetCategory,
      name: classificationResult.name,
      confidence: classificationResult.confidence,
      clarificationNeeded: useInbox
    };

    return {
      success: true,
      data: captureResult
    };
  }

  /**
   * Build entry data from classification result based on category
   * Maps ClassificationResult fields to CreateEntryInput format
   */
  private buildEntryData(result: ClassificationResult): CreatePeopleInput | CreateProjectsInput | CreateIdeasInput | CreateAdminInput {
    const baseData = {
      name: result.name,
      confidence: result.confidence,
      tags: [] as string[],
      source_channel: 'api' as const
    };

    // Cast fields to unknown first, then to Record to access category-specific properties
    const fields = result.fields as unknown as Record<string, unknown>;

    switch (result.category) {
      case 'people':
        return {
          ...baseData,
          context: (fields.context as string) || '',
          follow_ups: (fields.followUps as string[]) || [],
          related_projects: (fields.relatedProjects as string[]) || []
        };
      case 'projects':
        return {
          ...baseData,
          status: (fields.status as 'active' | 'waiting' | 'blocked' | 'someday') || 'active',
          next_action: (fields.nextAction as string) || '',
          related_people: (fields.relatedPeople as string[]) || [],
          due_date: fields.dueDate as string | undefined
        };
      case 'ideas':
        return {
          ...baseData,
          one_liner: (fields.oneLiner as string) || '',
          related_projects: (fields.relatedProjects as string[]) || []
        };
      case 'admin':
        return {
          ...baseData,
          status: 'pending' as const,
          due_date: fields.dueDate as string | undefined
        };
    }
  }

  /**
   * Handle list_entries tool
   * Requirement 3.2: Return matching entries using EntryService.list()
   * 
   * @param args - Tool arguments { category?: string, status?: string, limit?: number }
   * @returns ToolResult with ListEntriesResult data
   */
  private async handleListEntries(args: Record<string, unknown>): Promise<ToolResult> {
    const category = args.category as Category | undefined;
    const status = args.status as string | undefined;
    const limit = (args.limit as number | undefined) ?? 10; // Default limit is 10 from schema

    // 1. Call entryService.list() with category and status filters
    const filters = status ? { status } : undefined;
    const allEntries = await this.entryService.list(category, filters);

    // 2. Get total count BEFORE applying limit (so user knows there are more)
    const total = allEntries.length;

    // 3. Apply limit to results
    const entries = allEntries.slice(0, limit);

    // 4. Return ListEntriesResult
    const result: ListEntriesResult = {
      entries,
      total
    };

    return {
      success: true,
      data: result
    };
  }

  /**
   * Handle get_entry tool
   * Requirement 3.3: Return full entry using EntryService.read()
   * 
   * @param args - Tool arguments { path: string }
   * @returns ToolResult with GetEntryResult data
   */
  private async handleGetEntry(args: Record<string, unknown>): Promise<ToolResult> {
    const path = args.path as string;

    // 1. Call entryService.read() to get full entry
    const entry = await this.entryService.read(path);

    // 2. Return GetEntryResult with entry data
    const result: GetEntryResult = {
      entry
    };

    return {
      success: true,
      data: result
    };
  }

  /**
   * Handle generate_digest tool
   * Requirement 3.4: Generate digest using DigestService
   * 
   * @param args - Tool arguments { type: 'daily' | 'weekly' }
   * @returns ToolResult with DigestResult data
   */
  private async handleGenerateDigest(args: Record<string, unknown>): Promise<ToolResult> {
    const type = args.type as 'daily' | 'weekly';

    // 1. Call appropriate DigestService method based on type
    let content: string;
    if (type === 'daily') {
      content = await this.digestService.generateDailyDigest();
    } else {
      content = await this.digestService.generateWeeklyReview();
    }

    // 2. Return DigestResult
    const result: DigestResult = {
      type,
      content
    };

    return {
      success: true,
      data: result
    };
  }

  /**
   * Handle update_entry tool
   * Requirement 3.5: Update entry using EntryService.update()
   * 
   * @param args - Tool arguments { path: string, updates: object }
   * @returns ToolResult with UpdateEntryResult data
   */
  private async handleUpdateEntry(args: Record<string, unknown>): Promise<ToolResult> {
    const path = args.path as string;
    const updates = args.updates as Record<string, unknown>;

    // 1. Call entryService.update() with path and updates
    await this.entryService.update(path, updates, 'api');

    // 2. Return UpdateEntryResult with path and updated fields
    const result: UpdateEntryResult = {
      path,
      updatedFields: Object.keys(updates)
    };

    return {
      success: true,
      data: result
    };
  }

  /**
   * Handle move_entry tool
   * Requirement 3.6: Move entry to different category
   * 
   * @param args - Tool arguments { path: string, targetCategory: string }
   * @returns ToolResult with MoveEntryResult data
   */
  private async handleMoveEntry(args: Record<string, unknown>): Promise<ToolResult> {
    const path = args.path as string;
    const targetCategory = args.targetCategory as Category;

    // 1. Read existing entry
    const existingEntry = await this.entryService.read(path);
    const sourceCategory = existingEntry.category;

    // 2. Transform fields for target category
    const entryData = this.transformEntryForCategory(existingEntry, targetCategory);

    // 3. Create new entry in target category
    // EntryService.create() handles slug collision by throwing EntryAlreadyExistsError
    const newEntry = await this.entryService.create(targetCategory, entryData, 'api');

    // 4. Delete old entry
    await this.entryService.delete(path, 'api');

    // 5. Return MoveEntryResult
    const result: MoveEntryResult = {
      oldPath: path,
      newPath: newEntry.path,
      category: targetCategory
    };

    return {
      success: true,
      data: result
    };
  }

  /**
   * Transform entry data from source category to target category format
   * Keeps common fields (name, tags, confidence, source_channel) and adds category-specific defaults
   * For inbox entries, uses suggested_name as name
   */
  private transformEntryForCategory(
    existingEntry: EntryWithPath,
    targetCategory: Category
  ): CreatePeopleInput | CreateProjectsInput | CreateIdeasInput | CreateAdminInput {
    const entry = existingEntry.entry;
    const sourceCategory = existingEntry.category;

    // Extract common fields
    // For inbox entries, use suggested_name as name
    let name: string;
    let tags: string[] = [];
    let confidence: number;
    let sourceChannel: 'chat' | 'email' | 'api';

    if (sourceCategory === 'inbox') {
      const inboxEntry = entry as import('../types/entry.types').InboxEntry;
      name = inboxEntry.suggested_name;
      confidence = inboxEntry.confidence;
      sourceChannel = inboxEntry.source_channel;
    } else {
      const baseEntry = entry as import('../types/entry.types').BaseEntry;
      name = baseEntry.name;
      tags = baseEntry.tags || [];
      confidence = baseEntry.confidence;
      sourceChannel = baseEntry.source_channel;
    }

    // Build target category-specific entry data
    switch (targetCategory) {
      case 'people':
        return {
          name,
          tags,
          confidence,
          source_channel: sourceChannel,
          context: '',
          follow_ups: [],
          related_projects: []
        };
      case 'projects':
        return {
          name,
          tags,
          confidence,
          source_channel: sourceChannel,
          status: 'active' as const,
          next_action: '',
          related_people: []
        };
      case 'ideas':
        return {
          name,
          tags,
          confidence,
          source_channel: sourceChannel,
          one_liner: '',
          related_projects: []
        };
      case 'admin':
        return {
          name,
          tags,
          confidence,
          source_channel: sourceChannel,
          status: 'pending' as const
        };
      default:
        // This shouldn't happen due to schema validation, but TypeScript needs it
        throw new Error(`Invalid target category: ${targetCategory}`);
    }
  }

  /**
   * Handle search_entries tool
   * Requirement 3.7: Search entries using SearchService
   * 
   * @param args - Tool arguments { query: string, category?: string, limit?: number }
   * @returns ToolResult with SearchResult data
   */
  private async handleSearchEntries(args: Record<string, unknown>): Promise<ToolResult> {
    const query = args.query as string;
    const category = args.category as Category | undefined;
    const limit = args.limit as number | undefined;

    // 1. Call searchService.search() with query and options
    const searchResult = await this.searchService.search(query, { category, limit });

    // 2. Return SearchResult with entries and total
    const result: SearchResult = {
      entries: searchResult.entries,
      total: searchResult.total
    };

    return {
      success: true,
      data: result
    };
  }
}

// ============================================
// Singleton Instance
// ============================================

let toolExecutorInstance: ToolExecutor | null = null;

/**
 * Get the singleton ToolExecutor instance
 */
export function getToolExecutor(): ToolExecutor {
  if (!toolExecutorInstance) {
    toolExecutorInstance = new ToolExecutor();
  }
  return toolExecutorInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetToolExecutor(): void {
  toolExecutorInstance = null;
}

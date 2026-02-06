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
import {
  ClassificationAgent,
  getClassificationAgent,
  ClassificationAPIError,
  ClassificationTimeoutError,
  InvalidClassificationResponseError,
  ClassificationError
} from './classification.service';
import { DigestService, getDigestService } from './digest.service';
import { SearchService, getSearchService, SearchHit } from './search.service';
import { IndexService, getIndexService } from './index.service';
import { ActionExtractionService, getActionExtractionService } from './action-extraction.service';
import { DuplicateService, getDuplicateService, DuplicateHit } from './duplicate.service';
import { OfflineQueueService, getOfflineQueueService } from './offline-queue.service';
import { EntryLinkService, getEntryLinkService } from './entry-link.service';
import { IntentAnalysisService, getIntentAnalysisService, UpdateIntentAnalysis } from './intent-analysis.service';
import { CLASSIFICATION_SYSTEM_PROMPT } from './context.service';
import { 
  Category, 
  Channel,
  EntrySummary, 
  EntryWithPath,
  CreatePeopleInput,
  CreateProjectsInput,
  CreateIdeasInput,
  CreateAdminInput,
  BodyContentUpdate,
  BodyContentMode
} from '../types/entry.types';
import { ContextWindow, ClassificationResult, AdminFields } from '../types/chat.types';
import { getConfig } from '../config/env';
import { normalizeDueDate } from '../utils/date';

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
  queued?: boolean;
  queueId?: string;
  message?: string;
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
  bodyUpdated?: boolean;
  bodyMode?: BodyContentMode;
  warnings?: string[];
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

/**
 * Result from find_duplicates tool
 */
export interface DuplicateResult {
  duplicates: DuplicateHit[];
}

/**
 * Result from delete_entry tool
 * Requirements 3.2, 3.3: Delete entry and return path/name
 */
export interface DeleteEntryResult {
  path: string;
  name: string;
  category: Category;
}

// ============================================
// Tool Executor Class
// ============================================

/**
 * Execution options for tool calls
 */
export interface ToolExecutionOptions {
  channel?: Channel;
  context?: ContextWindow;
  allowQueue?: boolean;
}

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
  private actionExtractionService?: ActionExtractionService;
  private duplicateService?: DuplicateService;
  private offlineQueueService?: OfflineQueueService;
  private entryLinkService?: EntryLinkService;
  private intentAnalysisService?: IntentAnalysisService;

  constructor(
    toolRegistry?: ToolRegistry,
    entryService?: EntryService,
    classificationAgent?: ClassificationAgent,
    digestService?: DigestService,
    searchService?: SearchService,
    indexService?: IndexService,
    actionExtractionService?: ActionExtractionService,
    duplicateService?: DuplicateService,
    offlineQueueService?: OfflineQueueService,
    entryLinkService?: EntryLinkService,
    intentAnalysisService?: IntentAnalysisService
  ) {
    this.toolRegistry = toolRegistry || getToolRegistry();
    this.entryService = entryService || getEntryService();
    this.classificationAgent = classificationAgent || getClassificationAgent();
    this.digestService = digestService || getDigestService();
    this.searchService = searchService || getSearchService();
    this.indexService = indexService || getIndexService();
    this.actionExtractionService = actionExtractionService;
    this.duplicateService = duplicateService;
    this.offlineQueueService = offlineQueueService;
    this.entryLinkService = entryLinkService || getEntryLinkService();
    this.intentAnalysisService = intentAnalysisService;
  }

  /**
   * Execute a tool call and return the result
   * 
   * @param toolCall - The tool call to execute
   * @returns ToolResult with success/error status and data
   */
  async execute(toolCall: ToolCall, options?: ToolExecutionOptions): Promise<ToolResult> {
    const { name, arguments: args } = toolCall;
    const channel: Channel = options?.channel || 'api';
    const context = options?.context;
    const allowQueue = options?.allowQueue !== false;

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
          return await this.handleClassifyAndCapture(args, channel, context, allowQueue);
        
        case 'list_entries':
          return await this.handleListEntries(args);
        
        case 'get_entry':
          return await this.handleGetEntry(args);
        
        case 'generate_digest':
          return await this.handleGenerateDigest(args);
        
        case 'update_entry':
          return await this.handleUpdateEntry(args, channel, context);
        
        case 'move_entry':
          return await this.handleMoveEntry(args, channel);
        
        case 'search_entries':
          return await this.handleSearchEntries(args);
        
        case 'delete_entry':
          return await this.handleDeleteEntry(args, channel);

        case 'find_duplicates':
          return await this.handleFindDuplicates(args);

        case 'merge_entries':
          return await this.handleMergeEntries(args, channel);
        
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

  private getActionExtractionService(): ActionExtractionService {
    if (!this.actionExtractionService) {
      this.actionExtractionService = getActionExtractionService();
    }
    return this.actionExtractionService;
  }

  private getDuplicateService(): DuplicateService {
    if (!this.duplicateService) {
      this.duplicateService = getDuplicateService();
    }
    return this.duplicateService;
  }

  private getOfflineQueueService(): OfflineQueueService {
    if (!this.offlineQueueService) {
      this.offlineQueueService = getOfflineQueueService();
    }
    return this.offlineQueueService;
  }

  private getIntentAnalysisService(): IntentAnalysisService {
    if (!this.intentAnalysisService) {
      this.intentAnalysisService = getIntentAnalysisService();
    }
    return this.intentAnalysisService;
  }

  /**
   * Handle classify_and_capture tool
   * Requirement 3.1: Classify thought and create entry using ClassificationAgent and EntryService
   * 
   * @param args - Tool arguments { text: string, hints?: string }
   * @returns ToolResult with CaptureResult data
   */
  private async handleClassifyAndCapture(
    args: Record<string, unknown>,
    channel: Channel,
    contextOverride?: ContextWindow,
    allowQueue: boolean = true
  ): Promise<ToolResult> {
    const text = args.text as string;
    const hints = args.hints as string | undefined;

    // 1. Build context for classification
    // Prefer full conversation context when provided (chat/email),
    // otherwise fall back to minimal context with index only.
    let context: ContextWindow;
    if (contextOverride) {
      context = contextOverride;
    } else {
      const indexContent = await this.indexService.getIndexContent();
      context = {
        systemPrompt: CLASSIFICATION_SYSTEM_PROMPT,
        indexContent,
        summaries: [],
        recentMessages: []
      };
    }

    // 2. Call classificationAgent.classify()
    let classificationResult: ClassificationResult;
    try {
      classificationResult = await this.classificationAgent.classify({
        text,
        hints,
        context
      });
    } catch (error) {
      if (allowQueue && this.shouldQueueClassificationError(error)) {
        const queueService = this.getOfflineQueueService();
        if (queueService.isEnabled()) {
          const queued = await queueService.enqueueCapture(text, hints, channel, context);
          if (queued) {
            const captureResult: CaptureResult = {
              path: '',
              category: 'inbox',
              name: '',
              confidence: 0,
              clarificationNeeded: false,
              queued: true,
              queueId: queued.id,
              message: 'Capture queued and will be processed when the LLM is available.'
            };
            return { success: true, data: captureResult };
          }
        }
      }
      throw error;
    }

    // 3. Determine if entry should go to inbox (confidence < 0.6) or classified category
    // Requirement 8.1: Backward compatibility with spec 002's routing behavior
    const confidenceThreshold = getConfig().CONFIDENCE_THRESHOLD;
    const useInbox = classificationResult.confidence < confidenceThreshold;
    const targetCategory: Category = useInbox ? 'inbox' : classificationResult.category;

    // 4. Extract bodyContent from classification result
    // Requirement 1.1: Classification Agent generates body content
    let bodyContent = classificationResult.bodyContent;

    // 5. Create entry using entryService.create()
    // Requirement 1.6: Pass bodyContent to EntryService.create()
    let createdEntry: EntryWithPath;

    if (useInbox) {
      const agentNote = this.buildAgentNote(classificationResult);
      // Create inbox entry with original text and suggested classification
      // Note: Inbox entries don't get body content since they need review
      createdEntry = await this.entryService.create('inbox', {
        original_text: text,
        suggested_category: classificationResult.category,
        suggested_name: classificationResult.name,
        confidence: classificationResult.confidence,
        source_channel: channel
      }, channel, agentNote);
    } else {
      // Create entry in the classified category with appropriate fields and body content
      let entryData = this.buildEntryData(classificationResult, channel, text);

      // Action extraction to enrich next actions for projects/admin
      const actionResult = await this.getActionExtractionService().extractActions(text, targetCategory);
      ({ entryData, bodyContent } = this.applyActionsToEntry(
        targetCategory,
        entryData,
        bodyContent,
        actionResult
      ));

      createdEntry = await this.entryService.create(targetCategory, entryData, channel, bodyContent);

      if (targetCategory === 'admin' && this.entryLinkService) {
        const adminFields = classificationResult.fields as AdminFields;
        if (adminFields.relatedPeople && adminFields.relatedPeople.length > 0) {
          await this.entryLinkService.linkPeopleForEntry(
            createdEntry,
            adminFields.relatedPeople,
            channel
          );
        }
      }
    }

    // 6. Return CaptureResult
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
  private buildEntryData(
    result: ClassificationResult,
    channel: Channel,
    sourceText: string
  ): CreatePeopleInput | CreateProjectsInput | CreateIdeasInput | CreateAdminInput {
    const baseData = {
      name: result.name,
      confidence: result.confidence,
      tags: [] as string[],
      source_channel: channel
    };

    // Cast fields to unknown first, then to Record to access category-specific properties
    const fields = result.fields as unknown as Record<string, unknown>;
    const rawDueDate = (fields.dueDate ?? fields.due_date) as string | undefined;
    const normalizedDueDate = normalizeDueDate(rawDueDate, sourceText);

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
          due_date: normalizedDueDate
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
          due_date: normalizedDueDate
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
   * Requirement 2.1: Accept body_content parameter for modifying entry body
   * 
   * @param args - Tool arguments { path: string, updates?: object, body_content?: object }
   * @returns ToolResult with UpdateEntryResult data
   */
  private async handleUpdateEntry(
    args: Record<string, unknown>,
    channel: Channel,
    context?: ContextWindow
  ): Promise<ToolResult> {
    const path = args.path as string;
    let updates = (args.updates as Record<string, unknown>) || {};
    const bodyContentArg = args.body_content as { content: string; mode: string; section?: string } | undefined;
    const warnings: string[] = [];
    const lastUserMessage = context?.recentMessages
      ?.slice()
      .reverse()
      .find((msg) => msg.role === 'user');
    let intentAnalysis: UpdateIntentAnalysis | undefined;

    // Parse body_content into BodyContentUpdate if provided
    let bodyUpdate: BodyContentUpdate | undefined;
    if (bodyContentArg) {
      // Validate mode is a valid BodyContentMode
      const mode = bodyContentArg.mode as BodyContentMode;
      if (!['append', 'replace', 'section'].includes(mode)) {
        return {
          success: false,
          error: `Invalid body_content mode: ${bodyContentArg.mode}. Must be 'append', 'replace', or 'section'.`
        };
      }

      // Validate section is provided when mode is 'section'
      if (mode === 'section' && !bodyContentArg.section) {
        return {
          success: false,
          error: 'Section name required for section mode'
        };
      }

      bodyUpdate = {
        content: bodyContentArg.content,
        mode,
        section: bodyContentArg.section
      };
    }

    if (channel === 'chat' && lastUserMessage?.content) {
      try {
        intentAnalysis = await this.getIntentAnalysisService().analyzeUpdateIntent({
          message: lastUserMessage.content,
          path,
          updates,
          hasBodyUpdate: Boolean(bodyUpdate)
        });
      } catch {
        warnings.push('Intent analysis unavailable; used heuristic parsing for update intent.');
      }
    }

    if (!('name' in updates) && !('suggested_name' in updates)) {
      if (intentAnalysis?.title) {
        updates = { ...updates, name: intentAnalysis.title };
      } else {
        const inferredEdits = this.inferTitleAndNoteFromContext(context);
        if (inferredEdits.title) {
          updates = { ...updates, name: inferredEdits.title };
        }
        if (!bodyUpdate && inferredEdits.note) {
          bodyUpdate = { content: inferredEdits.note, mode: 'append' };
        }
      }
    }
    if (!bodyUpdate && intentAnalysis?.note) {
      bodyUpdate = { content: intentAnalysis.note, mode: 'append' };
    }

    const statusWarning = this.getStatusUpdateWarning(updates, context, channel, intentAnalysis);
    if (statusWarning) {
      const { status: _status, ...rest } = updates as Record<string, unknown>;
      updates = rest;
      warnings.push(statusWarning);
    }

    // 1. Call entryService.update() with path, updates, and bodyUpdate
    const updatedEntry = await this.entryService.update(path, updates, channel, bodyUpdate);

    // 2. Link related people for admin tasks when provided in updates
    if (this.entryLinkService && updatedEntry.category === 'admin') {
      const relatedPeople = (updates as any).related_people ?? (updates as any).relatedPeople;
      const inferred = this.inferRelatedPeopleFromUpdate(
        updatedEntry,
        relatedPeople,
        bodyUpdate,
        context,
        intentAnalysis?.relatedPeople
      );
      if (inferred.length > 0) {
        await this.entryLinkService.linkPeopleForEntry(updatedEntry, inferred, channel);
      }
    }

    // 3. Return UpdateEntryResult with path, updated fields, and body update info
    const result: UpdateEntryResult = {
      path,
      updatedFields: Object.keys(updates)
    };

    // Include body update info in response if body was updated
    if (bodyUpdate) {
      result.bodyUpdated = true;
      result.bodyMode = bodyUpdate.mode;
    }
    if (warnings.length > 0) {
      result.warnings = warnings;
    }

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
  private async handleMoveEntry(args: Record<string, unknown>, channel: Channel): Promise<ToolResult> {
    const path = args.path as string;
    const targetCategory = args.targetCategory as Category;

    // 1. Move entry using EntryService.move()
    const moveResult = await this.entryService.move(path, targetCategory, channel);

    // 2. Return MoveEntryResult
    const result: MoveEntryResult = {
      oldPath: path,
      newPath: moveResult.path,
      category: targetCategory
    };

    return {
      success: true,
      data: result
    };
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

  private inferRelatedPeopleFromUpdate(
    updatedEntry: EntryWithPath,
    relatedPeople: unknown,
    bodyUpdate: BodyContentUpdate | undefined,
    context?: ContextWindow,
    intentPeople?: string[]
  ): string[] {
    if (Array.isArray(relatedPeople) && relatedPeople.length > 0) {
      return relatedPeople;
    }

    const textCandidates: string[] = [];
    const entryName = (updatedEntry.entry as { name?: string })?.name;
    if (entryName) textCandidates.push(entryName);
    if (bodyUpdate?.content) textCandidates.push(bodyUpdate.content);

    const lastUserMessage = context?.recentMessages
      ?.slice()
      .reverse()
      .find((msg) => msg.role === 'user');
    if (lastUserMessage?.content) {
      textCandidates.push(lastUserMessage.content);
    }

    const extracted = new Set<string>();
    for (const person of intentPeople || []) {
      if (typeof person === 'string' && person.trim()) {
        extracted.add(person.trim());
      }
    }
    for (const text of textCandidates) {
      for (const name of this.extractPersonNames(text)) {
        extracted.add(name);
      }
    }

    return Array.from(extracted);
  }

  private inferTitleAndNoteFromContext(context?: ContextWindow): { title?: string; note?: string } {
    const lastUserMessage = context?.recentMessages
      ?.slice()
      .reverse()
      .find((msg) => msg.role === 'user');
    if (!lastUserMessage?.content) {
      return {};
    }

    const message = lastUserMessage.content;
    const titleFromQuotes = this.extractQuotedPhrase(
      message,
      /(update|rename|change)(?:\s+the)?(?:\s+(?:entry|task|item))?(?:\s+(?:title|name))?\s+(?:to|as)\s+["“]([^"”]+)["”]/i
    );
    const noteFromQuotes = this.extractQuotedPhrase(
      message,
      /(add|append|include)\s+(?:a\s+)?note(?:\s+that|\s+to)?\s+["“]([^"”]+)["”]/i
    );

    let title = titleFromQuotes;
    let note = noteFromQuotes;

    if (!title) {
      const titleMatch = message.match(
        /(update|rename|change)(?:\s+the)?(?:\s+(?:entry|task|item))?(?:\s+(?:title|name))?\s+(?:to|as)\s+([^.]+)(?:\.|$)/i
      );
      if (titleMatch?.[2]) {
        title = titleMatch[2].trim();
      }
    }

    if (!note) {
      const noteMatch = message.match(
        /(add|append|include)\s+(?:a\s+)?note(?:\s+that|\s+to)?\s+(.+)$/i
      );
      if (noteMatch?.[2]) {
        note = noteMatch[2].trim();
      }
    }

    if (title) {
      title = title.replace(/\s+$/g, '');
    }
    if (note) {
      note = note.replace(/\s+$/g, '').replace(/\.$/, '');
    }

    if (title && note && title === note) {
      note = undefined;
    }

    return { title, note };
  }

  private getStatusUpdateWarning(
    updates: Record<string, unknown>,
    context: ContextWindow | undefined,
    channel: Channel,
    intentAnalysis?: UpdateIntentAnalysis
  ): string | null {
    if (!('status' in updates)) return null;
    if (channel !== 'chat') return null;
    if (intentAnalysis) {
      if (intentAnalysis.statusChangeRequested) {
        return null;
      }
      return 'Status update ignored because the user did not request a status change.';
    }
    const lastUserMessage = context?.recentMessages
      ?.slice()
      .reverse()
      .find((msg) => msg.role === 'user');
    if (!lastUserMessage?.content) {
      return 'Status update ignored because no user message context was available.';
    }
    const text = lastUserMessage.content.toLowerCase();
    const statusKeywords = [
      'mark done',
      'done',
      'completed',
      'complete',
      'finished',
      'reopen',
      'pending',
      'active',
      'waiting',
      'blocked'
    ];
    if (statusKeywords.some((keyword) => text.includes(keyword))) {
      return null;
    }
    return 'Status update ignored because the user did not request a status change.';
  }

  private extractQuotedPhrase(text: string, regex: RegExp): string | undefined {
    const match = text.match(regex);
    if (!match?.[2]) {
      return undefined;
    }
    return match[2].trim();
  }

  private extractPersonNames(text: string): string[] {
    const results: string[] = [];
    const verbs =
      '(call|email|text|ping|meet|meeting with|meet with|talk to|chat with|follow up with|follow up|schedule|remind|pay)';
    const regex = new RegExp(`\\b${verbs}\\s+([a-z][a-z]+(?:\\s+[a-z][a-z]+){0,3})`, 'gi');
    const stopwords = new Set([
      'the',
      'a',
      'an',
      'about',
      'regarding',
      're',
      'with',
      'task',
      'project',
      'item',
      'note',
      'my',
      'his',
      'her',
      'their',
      'your',
      'our',
      'apology',
      'apologies',
      'sorry',
      'delay',
      'delays'
    ]);

    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      const raw = match[2];
      const words = raw
        .split(/\s+/)
        .map((word) => word.trim())
        .filter(Boolean)
        .filter((word) => !stopwords.has(word.toLowerCase()));

      if (words.length === 0) {
        continue;
      }

      const hasCapitalized = words.some((word) => /^(?:[A-Z][a-z].*|[A-Z]{2,})$/.test(word));
      if (!hasCapitalized) {
        continue;
      }

      const normalized = words
        .slice(0, 3)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');

      if (normalized.length > 1) {
        results.push(normalized);
      }
    }

    return results;
  }

  /**
   * Handle find_duplicates tool
   */
  private async handleFindDuplicates(args: Record<string, unknown>): Promise<ToolResult> {
    const name = args.name as string | undefined;
    const text = args.text as string | undefined;
    const category = args.category as Category | undefined;
    const limit = args.limit as number | undefined;
    const excludePath = args.excludePath as string | undefined;

    const duplicates = await this.getDuplicateService().findDuplicatesForText({
      name,
      text,
      category,
      limit,
      excludePath
    });

    const result: DuplicateResult = { duplicates };

    return {
      success: true,
      data: result
    };
  }

  /**
   * Handle merge_entries tool
   */
  private async handleMergeEntries(args: Record<string, unknown>, channel: Channel): Promise<ToolResult> {
    const targetPath = args.targetPath as string;
    const sourcePaths = args.sourcePaths as string[];

    if (!targetPath || !Array.isArray(sourcePaths) || sourcePaths.length === 0) {
      return {
        success: false,
        error: 'targetPath and sourcePaths are required for merge_entries'
      };
    }

    const merged = await this.entryService.merge(targetPath, sourcePaths, channel);
    return {
      success: true,
      data: { entry: merged }
    };
  }

  private applyActionsToEntry(
    category: Category,
    entryData: CreatePeopleInput | CreateProjectsInput | CreateIdeasInput | CreateAdminInput,
    bodyContent: string,
    actionResult: { actions: Array<{ text: string; dueDate?: string }>; primaryAction?: string }
  ): { entryData: CreatePeopleInput | CreateProjectsInput | CreateIdeasInput | CreateAdminInput; bodyContent: string } {
    if (!actionResult || actionResult.actions.length === 0) {
      return { entryData, bodyContent };
    }

    const actionLines = actionResult.actions.map((action) => {
      const due = action.dueDate ? ` (due ${action.dueDate})` : '';
      return `- ${action.text}${due}`;
    });

    if (category === 'projects') {
      const projectData = entryData as CreateProjectsInput;
      if (!projectData.next_action && actionResult.primaryAction) {
        projectData.next_action = actionResult.primaryAction;
      } else if (!projectData.next_action && actionResult.actions[0]) {
        projectData.next_action = actionResult.actions[0].text;
      }
    }

    if (category === 'admin') {
      const adminData = entryData as CreateAdminInput;
      if (!adminData.name && actionResult.primaryAction) {
        adminData.name = actionResult.primaryAction;
      }
    }

    const actionsSection = `## Actions\n\n${actionLines.join('\n')}`;
    if (bodyContent && bodyContent.trim().length > 0) {
      bodyContent = `${bodyContent.trim()}\n\n${actionsSection}`;
    } else {
      bodyContent = actionsSection;
    }

    return { entryData, bodyContent };
  }

  private shouldQueueClassificationError(error: unknown): boolean {
    if (
      (typeof ClassificationTimeoutError === 'function' && error instanceof ClassificationTimeoutError) ||
      (typeof ClassificationAPIError === 'function' && error instanceof ClassificationAPIError)
    ) {
      return true;
    }

    if (typeof InvalidClassificationResponseError === 'function' && error instanceof InvalidClassificationResponseError) {
      return false;
    }

    if (typeof ClassificationError === 'function' && error instanceof ClassificationError) {
      const message = error.message.toLowerCase();
      return message.includes('openai') || message.includes('timeout') || message.includes('rate limit');
    }

    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      return message.includes('openai') || message.includes('timeout') || message.includes('rate limit');
    }

    return false;
  }

  /**
   * Handle delete_entry tool
   * Requirements 3.2, 3.3, 3.4, 3.5: Delete entry using EntryService.delete()
   * 
   * @param args - Tool arguments { path: string }
   * @returns ToolResult with DeleteEntryResult data
   */
  private async handleDeleteEntry(args: Record<string, unknown>, channel: Channel): Promise<ToolResult> {
    const path = args.path as string;

    // 1. Read entry first to get name for response (Requirement 3.3)
    // This will throw EntryNotFoundError if entry doesn't exist (Requirement 3.4)
    const existing = await this.entryService.read(path);
    const category = existing.category;
    
    // Get name based on category type
    // Inbox entries use suggested_name, other categories use name
    const name = category === 'inbox'
      ? (existing.entry as import('../types/entry.types').InboxEntry).suggested_name
      : (existing.entry as import('../types/entry.types').BaseEntry).name;

    // 2. Delete the entry (Requirement 3.2)
    // EntryService.delete() handles index regeneration and git commit (Requirement 3.5)
    await this.entryService.delete(path, channel);

    // 3. Return DeleteEntryResult with path and name (Requirement 3.3)
    const result: DeleteEntryResult = {
      path,
      name,
      category
    };

    return {
      success: true,
      data: result
    };
  }

  /**
   * Build an agent note for inbox entries
   */
  private buildAgentNote(result: ClassificationResult): string {
    const confidencePercent = Math.round(result.confidence * 100);
    return [
      '## Agent Note',
      '',
      `Low confidence classification (${confidencePercent}%).`,
      result.reasoning ? `Reasoning: ${result.reasoning}` : '',
      '',
      'Please clarify by replying with a category hint like [project], [person], [idea], or [task].'
    ]
      .filter(line => line !== '')
      .join('\n');
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

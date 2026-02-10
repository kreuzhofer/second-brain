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
import { ToolGuardrailService, getToolGuardrailService } from './tool-guardrail.service';
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
import { isTaskCategory, toCanonicalCategory } from '../utils/category';

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

export interface MutationReceipt {
  operation: 'update' | 'move' | 'delete';
  requestedPath: string;
  resolvedPath: string;
  verification: {
    verified: boolean;
    checks: string[];
  };
  timestamp: string;
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
  captureKind?: 'standard' | 'people_relationship';
  relatedPeople?: string[];
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
  receipt?: MutationReceipt;
}

/**
 * Result from move_entry tool
 * Requirement 3.6: Move entry to different category
 */
export interface MoveEntryResult {
  oldPath: string;
  newPath: string;
  category: Category;
  receipt?: MutationReceipt;
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
  receipt?: MutationReceipt;
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
  private toolGuardrailService?: Pick<ToolGuardrailService, 'validateToolCall'>;

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
    intentAnalysisService?: IntentAnalysisService,
    toolGuardrailService?: Pick<ToolGuardrailService, 'validateToolCall'>
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
    this.toolGuardrailService = toolGuardrailService;
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

    const guardrailCheck = this.shouldRunToolGuardrail(name, channel, context);
    if (guardrailCheck.run && guardrailCheck.message) {
      try {
        const decision = await this.getToolGuardrailService().validateToolCall({
          toolName: name,
          args,
          userMessage: guardrailCheck.message
        });
        if (!decision.allowed) {
          return {
            success: false,
            error: `Tool call blocked by guardrail: ${decision.reason || 'mismatch with user intent'}`
          };
        }
      } catch (error) {
        return {
          success: false,
          error: `Tool guardrail check failed: ${error instanceof Error ? error.message : 'unknown error'}`
        };
      }
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
          return await this.handleMoveEntry(args, channel, context);
        
        case 'search_entries':
          return await this.handleSearchEntries(args);
        
        case 'delete_entry':
          return await this.handleDeleteEntry(args, channel, context);

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

  private getToolGuardrailService(): Pick<ToolGuardrailService, 'validateToolCall'> {
    if (this.toolGuardrailService) {
      return this.toolGuardrailService;
    }
    if (process.env.NODE_ENV === 'test') {
      this.toolGuardrailService = {
        validateToolCall: async () => ({ allowed: true, confidence: 1 })
      };
      return this.toolGuardrailService;
    }
    this.toolGuardrailService = getToolGuardrailService();
    return this.toolGuardrailService;
  }

  private shouldRunToolGuardrail(
    toolName: string,
    channel: Channel,
    context?: ContextWindow
  ): { run: boolean; message?: string } {
    if (channel !== 'chat') {
      return { run: false };
    }

    const mutatingTools = new Set([
      'classify_and_capture',
      'update_entry',
      'move_entry',
      'delete_entry',
      'merge_entries'
    ]);
    if (!mutatingTools.has(toolName)) {
      return { run: false };
    }

    const userMessage = this.buildGuardrailContextMessage(context);

    if (!userMessage) {
      return { run: false };
    }

    return { run: true, message: userMessage };
  }

  private buildGuardrailContextMessage(context?: ContextWindow): string | undefined {
    if (!context?.recentMessages || context.recentMessages.length === 0) {
      return undefined;
    }

    const latestUserMessage = context.recentMessages
      .slice()
      .reverse()
      .find((msg) => msg.role === 'user')?.content;
    if (!latestUserMessage) {
      return undefined;
    }

    const compactRecent = context.recentMessages
      .slice(-6)
      .map((msg) => `${msg.role}: ${msg.content}`);

    return [
      `Current user message: ${latestUserMessage}`,
      'Recent conversation context:',
      ...compactRecent
    ].join('\n');
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

    const relationshipIntent = this.detectPeopleRelationshipIntent(text);
    if (relationshipIntent && this.entryLinkService) {
      const primaryEntry = await this.entryLinkService.capturePeopleRelationship(
        relationshipIntent.people,
        relationshipIntent.kind,
        text,
        channel
      );
      const captureResult: CaptureResult = {
        path: primaryEntry.path,
        category: primaryEntry.category,
        name: (primaryEntry.entry as { name?: string }).name || relationshipIntent.people[0],
        confidence: 0.95,
        clarificationNeeded: false,
        captureKind: 'people_relationship',
        relatedPeople: relationshipIntent.people
      };
      return {
        success: true,
        data: captureResult
      };
    }

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

      if (this.entryLinkService) {
        const relatedPeople = this.inferRelatedPeopleFromCapture(classificationResult);
        if (relatedPeople.length > 0) {
          await this.entryLinkService.linkPeopleForEntry(createdEntry, relatedPeople, channel);
        }
        const relatedProjects = this.inferRelatedProjectsFromCapture(classificationResult);
        if (relatedProjects.length > 0) {
          await this.entryLinkService.linkProjectsForEntry(createdEntry, relatedProjects);
        }
      }
    }

    // 6. Return CaptureResult
    const captureResult: CaptureResult = {
      path: createdEntry.path,
      category: toCanonicalCategory(targetCategory),
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
    const rawDueAt = (fields.dueAt ?? fields.due_at) as string | undefined;
    const normalizedDueAt = typeof rawDueAt === 'string' && rawDueAt.trim() ? rawDueAt : undefined;
    const rawFixedAt = (fields.fixedAt ?? fields.fixed_at) as string | undefined;
    const normalizedFixedAt = typeof rawFixedAt === 'string' && rawFixedAt.trim() ? rawFixedAt : undefined;
    const rawDurationMinutes = fields.durationMinutes ?? fields.duration_minutes;
    const inferredDurationMinutes = this.extractDurationMinutes(rawDurationMinutes, sourceText);
    const rawPriority = fields.priority;
    const inferredPriority = this.extractTaskPriority(rawPriority, sourceText);

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
      case 'task':
      case 'admin':
        return {
          ...baseData,
          status: 'pending' as const,
          due_date: normalizedDueDate,
          due_at: normalizedDueAt,
          duration_minutes: inferredDurationMinutes,
          fixed_at: normalizedFixedAt,
          priority: inferredPriority
        };
    }
  }

  private extractDurationMinutes(rawValue: unknown, sourceText: string): number | undefined {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      return Math.max(5, Math.floor(rawValue));
    }
    if (typeof rawValue === 'string' && rawValue.trim()) {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) {
        return Math.max(5, Math.floor(parsed));
      }
    }

    const durationMatch = sourceText.match(/\b(\d{1,3})\s*(?:m|min|mins|minute|minutes)\b/i);
    if (durationMatch) {
      return Math.max(5, Math.floor(Number(durationMatch[1])));
    }

    const hourMatch = sourceText.match(/\b(\d{1,2})\s*(?:h|hr|hrs|hour|hours)\b/i);
    if (hourMatch) {
      return Math.max(5, Math.floor(Number(hourMatch[1]) * 60));
    }

    return undefined;
  }

  private extractTaskPriority(rawValue: unknown, sourceText: string): number | undefined {
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      const bounded = Math.floor(rawValue);
      return bounded >= 1 && bounded <= 5 ? bounded : undefined;
    }
    if (typeof rawValue === 'string' && rawValue.trim()) {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) {
        const bounded = Math.floor(parsed);
        return bounded >= 1 && bounded <= 5 ? bounded : undefined;
      }
    }

    const lowered = sourceText.toLowerCase();
    if (/\b(urgent|highest priority|very important)\b/.test(lowered)) {
      return 5;
    }
    if (/\b(high priority|important)\b/.test(lowered)) {
      return 4;
    }
    if (/\b(low priority|someday|whenever)\b/.test(lowered)) {
      return 2;
    }
    return undefined;
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
    let resultPath = path;
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

    const statusGuardrail = this.applyStatusGuardrails(updates, context, channel, intentAnalysis);
    updates = statusGuardrail.updates;
    if (statusGuardrail.warning) {
      warnings.push(statusGuardrail.warning);
    }

    const preResolution = await this.resolveMutationPathBeforeMutation(path, {
      operation: 'update',
      channel,
      context
    });
    if (preResolution.path !== path && preResolution.warning) {
      warnings.push(preResolution.warning);
      resultPath = preResolution.path;
    }

    // 1. Call entryService.update() with resolved path, updates, and bodyUpdate
    let updatedEntry: EntryWithPath;
    try {
      updatedEntry = await this.entryService.update(resultPath, updates, channel, bodyUpdate);
    } catch (error) {
      const fallback = await this.tryReopenCompletedTaskFallback(
        error,
        path,
        updates,
        bodyUpdate,
        channel,
        context,
        intentAnalysis
      );
      if (fallback) {
        updatedEntry = fallback.updatedEntry;
        resultPath = fallback.resolvedPath;
        warnings.push(fallback.warning);
      } else {
        const resolved = await this.resolveMutationSourcePath(
          resultPath,
          {
            operation: 'update',
            channel,
            context,
            error
          }
        );
        if (!resolved) {
          throw error;
        }
        resultPath = resolved.path;
        updatedEntry = await this.entryService.update(resolved.path, updates, channel, bodyUpdate);
        warnings.push(resolved.warning);
      }
    }

    const updateVerification = this.verifyUpdateMutation(resultPath, updatedEntry, updates, bodyUpdate);
    if (!updateVerification.verified) {
      return {
        success: false,
        error: `Mutation verification failed: ${updateVerification.checks.join(' | ')}`
      };
    }

    // 2. Link related people for admin tasks when provided in updates
    if (this.entryLinkService) {
      const relatedPeople = (updates as any).related_people ?? (updates as any).relatedPeople;
      if (isTaskCategory(updatedEntry.category) || updatedEntry.category === 'projects') {
        const inferred = this.inferRelatedPeopleFromUpdate(
          updatedEntry,
          relatedPeople,
          bodyUpdate,
          context,
          intentAnalysis?.relatedPeople,
          intentAnalysis?.title
        );
        if (inferred.length > 0) {
          await this.entryLinkService.linkPeopleForEntry(updatedEntry, inferred, channel);
        }
      }

      if (isTaskCategory(updatedEntry.category)) {
        const projectRefs = this.inferRelatedProjectsFromUpdate(updates, intentAnalysis);
        if (projectRefs.length > 0) {
          await this.entryLinkService.linkProjectsForEntry(
            updatedEntry,
            projectRefs,
            channel,
            { createMissing: true }
          );
        }
      }
    }

    // 3. Return UpdateEntryResult with path, updated fields, and body update info
    const result: UpdateEntryResult = {
      path: resultPath,
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
    result.receipt = this.buildMutationReceipt('update', path, resultPath, updateVerification);

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
  private async handleMoveEntry(
    args: Record<string, unknown>,
    channel: Channel,
    context?: ContextWindow
  ): Promise<ToolResult> {
    const path = args.path as string;
    const targetCategory = args.targetCategory as Category;
    let sourcePath = path;

    const preResolution = await this.resolveMutationPathBeforeMutation(path, {
      operation: 'move',
      targetCategory,
      channel,
      context
    });
    sourcePath = preResolution.path;

    // 1. Move entry using EntryService.move()
    let moveResult: EntryWithPath;
    try {
      moveResult = await this.entryService.move(sourcePath, targetCategory, channel);
    } catch (error) {
      const fallbackPath = await this.resolveMoveSourcePath(sourcePath, targetCategory, channel, context, error);
      if (!fallbackPath) {
        throw error;
      }
      sourcePath = fallbackPath;
      moveResult = await this.entryService.move(fallbackPath, targetCategory, channel);
    }

    const moveVerification = this.verifyMoveMutation(sourcePath, targetCategory, moveResult);
    if (!moveVerification.verified) {
      return {
        success: false,
        error: `Mutation verification failed: ${moveVerification.checks.join(' | ')}`
      };
    }

    // 2. Return MoveEntryResult
    const result: MoveEntryResult = {
      oldPath: sourcePath,
      newPath: moveResult.path,
      category: targetCategory,
      receipt: this.buildMutationReceipt('move', path, sourcePath, moveVerification)
    };

    return {
      success: true,
      data: result
    };
  }

  private async resolveMoveSourcePath(
    requestedPath: string,
    targetCategory: Category,
    channel: Channel,
    context: ContextWindow | undefined,
    error: unknown
  ): Promise<string | null> {
    const resolved = await this.resolveMutationSourcePath(
      requestedPath,
      {
        operation: 'move',
        targetCategory,
        channel,
        context,
        error
      }
    );
    return resolved?.path ?? null;
  }

  private extractReclassificationQuery(message: string): string | null {
    const quotedMatch = message.match(/["“]([^"”]+)["”]/);
    if (quotedMatch?.[1]?.trim()) {
      return quotedMatch[1].trim();
    }

    const makeMatch = message.match(
      /make\s+(?:the\s+)?(.+?)\s+(?:an?\s+)?(?:admin(?:\s+task)?|task|project|idea|person|inbox)/i
    );
    if (makeMatch?.[1]) {
      return makeMatch[1].trim();
    }

    const moveMatch = message.match(
      /move\s+(.+?)\s+to\s+(?:an?\s+)?(?:admin(?:\s+task)?|task|project|idea|person|inbox)/i
    );
    if (moveMatch?.[1]) {
      return moveMatch[1].trim();
    }

    const reclassifyMatch = message.match(/(?:reclassify|change|convert)\s+(.+?)\s+(?:to|as)\s+/i);
    if (reclassifyMatch?.[1]) {
      return reclassifyMatch[1].trim();
    }

    return null;
  }

  private tokenizeReclassification(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1);
  }

  private scoreMoveCandidate(
    candidate: SearchHit,
    queryTokens: Set<string>,
    requestedTokens: Set<string>
  ): number {
    return this.scoreMutationCandidate(candidate, queryTokens, requestedTokens);
  }

  private async resolveMutationSourcePath(
    requestedPath: string,
    options: {
      operation: 'update' | 'move' | 'delete';
      targetCategory?: Category;
      channel: Channel;
      context?: ContextWindow;
      error: unknown;
    }
  ): Promise<{ path: string; warning: string } | null> {
    if (options.channel !== 'chat') return null;
    if (!(options.error instanceof Error) || !/not found/i.test(options.error.message)) return null;

    const userMessages = (options.context?.recentMessages || [])
      .filter((msg) => msg.role === 'user')
      .slice(-4)
      .map((msg) => msg.content)
      .filter((content) => typeof content === 'string' && content.trim().length > 0);
    if (userMessages.length === 0) return null;

    const queryCandidates = this.buildMutationQueryCandidates(
      options.operation,
      userMessages,
      requestedPath
    );
    if (queryCandidates.length === 0) return null;

    const requestedTokens = new Set(this.tokenizeReclassification(requestedPath.split('/').slice(1).join(' ')));
    const userTokens = new Set(this.tokenizeReclassification(userMessages.join(' ')));
    const scoredByPath = new Map<string, { candidate: SearchHit; score: number; query: string }>();

    for (const query of queryCandidates) {
      const searchResult = await this.searchService.search(query, { limit: 10 });
      const filtered = options.targetCategory
        ? searchResult.entries.filter((entry) => entry.category !== options.targetCategory)
        : searchResult.entries;
      const queryTokens = new Set(this.tokenizeReclassification(query));
      for (const candidate of filtered) {
        const score = this.scoreMutationCandidate(candidate, queryTokens, requestedTokens, userTokens);
        if (score <= 0) continue;
        const existing = scoredByPath.get(candidate.path);
        if (!existing || score > existing.score) {
          scoredByPath.set(candidate.path, { candidate, score, query });
        }
      }
    }

    const scored = Array.from(scoredByPath.values()).sort((a, b) => b.score - a.score);
    if (scored.length === 0) return null;

    if (scored.length > 1 && scored[0].score === scored[1].score) {
      const optionsList = scored
        .slice(0, 3)
        .map((item, index) => `${index + 1}. ${item.candidate.name} (${item.candidate.path})`)
        .join('\n');
      const actionLabel = options.operation === 'move'
        ? 'reclassify'
        : options.operation;
      throw new Error(`Multiple entries match your ${actionLabel} request. Which one should I use?\n${optionsList}`);
    }

    const winner = scored[0].candidate;
    return {
      path: winner.path,
      warning: `Requested path was not found. Used matching entry "${winner.name}" (${winner.path}).`
    };
  }

  private async resolveMutationPathBeforeMutation(
    requestedPath: string,
    options: {
      operation: 'update' | 'move' | 'delete';
      targetCategory?: Category;
      channel: Channel;
      context?: ContextWindow;
    }
  ): Promise<{ path: string; warning?: string }> {
    if (options.channel !== 'chat') {
      return { path: requestedPath };
    }

    const existence = await this.detectPathExistence(requestedPath);
    if (existence === 'exists' || existence === 'unknown') {
      return { path: requestedPath };
    }

    const resolved = await this.resolveMutationSourcePath(requestedPath, {
      ...options,
      error: new Error(`Entry not found: ${requestedPath}`)
    });
    if (!resolved) {
      return { path: requestedPath };
    }

    return resolved;
  }

  private async detectPathExistence(path: string): Promise<'exists' | 'missing' | 'unknown'> {
    try {
      const entry = await this.entryService.read(path);
      if (entry && typeof entry.path === 'string') {
        return 'exists';
      }
      return 'unknown';
    } catch (error) {
      if (error instanceof Error && /not found/i.test(error.message)) {
        return 'missing';
      }
      return 'unknown';
    }
  }

  private verifyUpdateMutation(
    resolvedPath: string,
    updatedEntry: EntryWithPath,
    updates: Record<string, unknown>,
    bodyUpdate?: BodyContentUpdate
  ): { verified: boolean; checks: string[] } {
    const checks: string[] = [];

    if (updatedEntry.path === resolvedPath) {
      checks.push(`path verified: ${resolvedPath}`);
    } else {
      checks.push(`path mismatch: expected ${resolvedPath}, got ${updatedEntry.path}`);
      return { verified: false, checks };
    }

    if ('status' in updates) {
      const expected = typeof updates.status === 'string' ? updates.status : undefined;
      const actual = typeof (updatedEntry.entry as any).status === 'string'
        ? (updatedEntry.entry as any).status
        : undefined;
      if (expected && actual === expected) {
        checks.push(`status verified: ${expected}`);
      } else {
        checks.push(`status mismatch: expected ${expected || 'unknown'}, got ${actual || 'unknown'}`);
        return { verified: false, checks };
      }
    }

    if ('due_date' in updates) {
      const expected = typeof updates.due_date === 'string' ? updates.due_date : undefined;
      const actual = typeof (updatedEntry.entry as any).due_date === 'string'
        ? (updatedEntry.entry as any).due_date
        : undefined;
      if (!expected || actual === expected) {
        checks.push(`due_date verified: ${actual || 'unset'}`);
      } else {
        checks.push(`due_date mismatch: expected ${expected}, got ${actual || 'unset'}`);
        return { verified: false, checks };
      }
    }

    if (bodyUpdate?.content?.trim()) {
      const content = updatedEntry.content || '';
      if (!content.includes(bodyUpdate.content.trim())) {
        checks.push('body content could not be strictly verified from stored content');
      } else {
        checks.push('body content verified');
      }
    }

    return { verified: true, checks };
  }

  private verifyMoveMutation(
    sourcePath: string,
    targetCategory: Category,
    movedEntry: EntryWithPath
  ): { verified: boolean; checks: string[] } {
    const checks: string[] = [];
    checks.push(`source path: ${sourcePath}`);

    if (movedEntry.category !== targetCategory) {
      checks.push(`category mismatch: expected ${targetCategory}, got ${movedEntry.category}`);
      return { verified: false, checks };
    }
    checks.push(`category verified: ${targetCategory}`);

    if (!movedEntry.path.startsWith(`${targetCategory}/`)) {
      checks.push(`new path mismatch: ${movedEntry.path}`);
      return { verified: false, checks };
    }
    checks.push(`new path verified: ${movedEntry.path}`);

    return { verified: true, checks };
  }

  private async verifyDeleteMutation(path: string): Promise<{ verified: boolean; checks: string[] }> {
    const checks: string[] = [];
    const existence = await this.detectPathExistence(path);

    if (existence === 'missing') {
      checks.push(`entry deleted: ${path}`);
      return { verified: true, checks };
    }

    if (existence === 'exists') {
      checks.push(`entry still exists after delete: ${path}`);
      return { verified: false, checks };
    }

    checks.push(`post-delete read check unavailable, accepted as best effort for ${path}`);
    return { verified: true, checks };
  }

  private buildMutationReceipt(
    operation: 'update' | 'move' | 'delete',
    requestedPath: string,
    resolvedPath: string,
    verification: { verified: boolean; checks: string[] }
  ): MutationReceipt {
    return {
      operation,
      requestedPath,
      resolvedPath,
      verification,
      timestamp: new Date().toISOString()
    };
  }

  private buildMutationQueryCandidates(
    operation: 'update' | 'move' | 'delete',
    userMessages: string[],
    requestedPath: string
  ): string[] {
    const candidates = new Set<string>();
    for (const message of userMessages) {
      for (const phrase of this.extractQuotedPhrases(message)) {
        candidates.add(phrase);
      }

      const opQuery = operation === 'move'
        ? this.extractReclassificationQuery(message)
        : this.extractMutationQuery(message, operation);
      if (opQuery) {
        candidates.add(opQuery);
      }
    }

    const slugCandidate = requestedPath.split('/').slice(1).join(' ').replace(/[-_]+/g, ' ').trim();
    if (slugCandidate.length > 0) {
      candidates.add(slugCandidate);
    }

    return Array.from(candidates).filter((value) => value.trim().length > 0);
  }

  private extractMutationQuery(message: string, operation: 'update' | 'delete'): string | null {
    if (operation === 'delete') {
      const deleteMatch = message.match(
        /(?:delete|remove|drop|archive)\s+(?:the\s+)?(?:entry|task|item|project|idea|person)?\s*["“]?([^"”?.!]+)["”]?/i
      );
      if (deleteMatch?.[1]?.trim()) {
        return deleteMatch[1].trim();
      }
      return null;
    }

    const updateMatch = message.match(
      /(?:update|rename|change|edit|set)\s+(?:the\s+)?(?:entry|task|item|project|idea|person)?\s*["“]?([^"”?.!]+)["”]?\s+(?:to|as|with)\b/i
    );
    if (updateMatch?.[1]?.trim()) {
      return updateMatch[1].trim();
    }
    return null;
  }

  private extractQuotedPhrases(message: string): string[] {
    const matches = message.matchAll(/["“]([^"”]+)["”]/g);
    const phrases: string[] = [];
    for (const match of matches) {
      if (match[1]?.trim()) {
        phrases.push(match[1].trim());
      }
    }
    return phrases;
  }

  private scoreMutationCandidate(
    candidate: SearchHit,
    queryTokens: Set<string>,
    requestedTokens: Set<string>,
    userTokens?: Set<string>
  ): number {
    const nameTokens = this.tokenizeReclassification(candidate.name);
    const pathTokens = this.tokenizeReclassification(candidate.path);
    const overlapQuery = nameTokens.filter((token) => queryTokens.has(token)).length;
    const overlapRequestedPath = pathTokens.filter((token) => requestedTokens.has(token)).length;
    const overlapUser = userTokens
      ? nameTokens.filter((token) => userTokens.has(token)).length
      : 0;
    const exactNameBoost = queryTokens.size > 0 && queryTokens.size === overlapQuery ? 3 : 0;
    return overlapQuery * 3 + overlapRequestedPath + overlapUser + exactNameBoost;
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
    intentPeople?: string[],
    intentTitle?: string
  ): string[] {
    if (Array.isArray(relatedPeople) && relatedPeople.length > 0) {
      return relatedPeople
        .filter((value): value is string => typeof value === 'string')
        .map((value) => this.sanitizePersonCandidate(value))
        .filter((value): value is string => Boolean(value));
    }

    const textCandidates: string[] = [];
    const entryName = (updatedEntry.entry as { name?: string })?.name;
    if (entryName) textCandidates.push(entryName);
    if (intentTitle) textCandidates.push(intentTitle);
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
        const sanitized = this.sanitizePersonCandidate(person);
        if (sanitized) {
          extracted.add(sanitized);
        }
      }
    }
    for (const text of textCandidates) {
      for (const name of this.extractPersonNames(text)) {
        extracted.add(name);
      }
      for (const name of this.extractPersonNamesFromTitle(text)) {
        extracted.add(name);
      }
    }

    return Array.from(extracted);
  }

  private inferRelatedPeopleFromCapture(result: ClassificationResult): string[] {
    const fields = (result.fields || {}) as unknown as Record<string, unknown>;
    const fromRelatedPeople = this.normalizeStringArray(fields.relatedPeople ?? fields.related_people);
    if (fromRelatedPeople.length > 0) {
      return fromRelatedPeople;
    }

    if (isTaskCategory(result.category)) {
      const adminFields = result.fields as AdminFields;
      return this.normalizeStringArray((adminFields as any).relatedPeople);
    }
    return [];
  }

  private inferRelatedProjectsFromCapture(result: ClassificationResult): string[] {
    const fields = (result.fields || {}) as unknown as Record<string, unknown>;
    return this.normalizeStringArray(fields.relatedProjects ?? fields.related_projects);
  }

  private inferRelatedProjectsFromUpdate(
    updates: Record<string, unknown>,
    intentAnalysis?: UpdateIntentAnalysis
  ): string[] {
    const fromUpdates = this.normalizeStringArray((updates as any).related_projects ?? (updates as any).relatedProjects);
    if (fromUpdates.length > 0) {
      return fromUpdates;
    }
    return this.normalizeStringArray(intentAnalysis?.relatedProjects);
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
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

  private applyStatusGuardrails(
    updates: Record<string, unknown>,
    context: ContextWindow | undefined,
    channel: Channel,
    intentAnalysis?: UpdateIntentAnalysis
  ): { updates: Record<string, unknown>; warning?: string } {
    if (!('status' in updates)) return { updates };
    if (channel !== 'chat') return { updates };

    let guarded = { ...updates };
    const currentStatus = typeof guarded.status === 'string' ? guarded.status : undefined;
    const normalizedRequestedStatus = this.normalizeRequestedStatus(intentAnalysis?.requestedStatus);

    if (intentAnalysis) {
      if (intentAnalysis.statusChangeRequested) {
        if (
          currentStatus &&
          normalizedRequestedStatus &&
          currentStatus.toLowerCase() !== normalizedRequestedStatus
        ) {
          guarded = { ...guarded, status: normalizedRequestedStatus };
          return {
            updates: guarded,
            warning: `Status update adjusted to "${normalizedRequestedStatus}" to match explicit user intent.`
          };
        }
        return { updates: guarded };
      }
      const { status: _status, ...rest } = guarded;
      return {
        updates: rest,
        warning: 'Status update ignored because the user did not request a status change.'
      };
    }
    const lastUserMessage = context?.recentMessages
      ?.slice()
      .reverse()
      .find((msg) => msg.role === 'user');
    if (!lastUserMessage?.content) {
      const { status: _status, ...rest } = guarded;
      return {
        updates: rest,
        warning: 'Status update ignored because no user message context was available.'
      };
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
      return { updates: guarded };
    }
    const { status: _status, ...rest } = guarded;
    return {
      updates: rest,
      warning: 'Status update ignored because the user did not request a status change.'
    };
  }

  private normalizeRequestedStatus(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const normalized = value.trim().toLowerCase();
    if (['pending', 'done', 'active', 'waiting', 'blocked', 'someday', 'needs_review'].includes(normalized)) {
      return normalized;
    }
    if (['todo', 'to do', 'in progress', 'reopen', 're-open', 'open', 'reopened'].includes(normalized)) {
      return 'pending';
    }
    return undefined;
  }

  private async tryReopenCompletedTaskFallback(
    error: unknown,
    originalPath: string,
    updates: Record<string, unknown>,
    bodyUpdate: BodyContentUpdate | undefined,
    channel: Channel,
    context: ContextWindow | undefined,
    intentAnalysis: UpdateIntentAnalysis | undefined
  ): Promise<{ updatedEntry: EntryWithPath; resolvedPath: string; warning: string } | null> {
    if (channel !== 'chat') return null;
    if (!(error instanceof Error) || !/not found/i.test(error.message)) return null;
    if (!this.isReopenFallbackCandidate(updates, context, intentAnalysis)) return null;

    const category = originalPath.split('/')[0] as Category;
    if (!isTaskCategory(category)) return null;

    const doneEntries = await this.entryService.list('task', { status: 'done' });
    if (doneEntries.length === 0) return null;

    const lastUserMessage = context?.recentMessages
      ?.slice()
      .reverse()
      .find((msg) => msg.role === 'user')?.content || '';
    const messageSource = lastUserMessage || originalPath.split('/').slice(1).join(' ');
    const messageTokens = new Set(this.tokenizeForMatch(messageSource));

    const scored = doneEntries
      .map((entry) => ({
        entry,
        score: this.scoreReopenCandidate(messageTokens, entry)
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) return null;
    if (scored.length > 1 && scored[0].score === scored[1].score) {
      const options = scored
        .slice(0, 3)
        .map((item) => `${item.entry.name} (${item.entry.path})`)
        .join(', ');
      throw new Error(`Multiple completed tasks match reopen request: ${options}`);
    }

    const winner = scored[0].entry;
    const updatedEntry = await this.entryService.update(winner.path, updates, channel, bodyUpdate);
    return {
      updatedEntry,
      resolvedPath: winner.path,
      warning: `Requested path was not found. Updated matching completed task "${winner.name}" (${winner.path}).`
    };
  }

  private isReopenFallbackCandidate(
    updates: Record<string, unknown>,
    context: ContextWindow | undefined,
    intentAnalysis: UpdateIntentAnalysis | undefined
  ): boolean {
    const status = typeof updates.status === 'string' ? updates.status.toLowerCase() : '';
    const candidateStatuses = new Set(['pending', 'active', 'waiting', 'blocked']);
    const requested = this.normalizeRequestedStatus(intentAnalysis?.requestedStatus);
    if (requested && candidateStatuses.has(requested)) {
      return true;
    }
    if (candidateStatuses.has(status) && intentAnalysis?.statusChangeRequested === true) {
      return true;
    }

    const lastUserMessage = context?.recentMessages
      ?.slice()
      .reverse()
      .find((msg) => msg.role === 'user')?.content;
    if (!lastUserMessage) return false;
    const text = lastUserMessage.toLowerCase();
    return (
      text.includes('reopen') ||
      text.includes('bring back') ||
      text.includes('set back') ||
      text.includes('mark back') ||
      text.includes('undo') ||
      /mark\s+.*(pending|todo|to do|in progress)/i.test(lastUserMessage)
    );
  }

  private tokenizeForMatch(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 1);
  }

  private scoreReopenCandidate(messageTokens: Set<string>, entry: EntrySummary): number {
    const nameTokens = this.tokenizeForMatch(entry.name);
    const pathTokens = this.tokenizeForMatch(entry.path);
    const overlapName = nameTokens.filter((token) => messageTokens.has(token)).length;
    const overlapPath = pathTokens.filter((token) => messageTokens.has(token)).length;
    return overlapName * 3 + overlapPath;
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

  private detectPeopleRelationshipIntent(
    text: string
  ): { people: [string, string]; kind: 'relationship' } | null {
    const compact = text.trim().replace(/\s+/g, ' ');
    if (!compact) return null;

    const patterns: RegExp[] = [
      /^([a-z][a-z'’-]{1,39})\s+and\s+([a-z][a-z'’-]{1,39})\s+(?:have|are in)\s+(?:a\s+)?relationship\b/i,
      /^([a-z][a-z'’-]{1,39})\s+is\s+(?:in\s+)?(?:a\s+)?relationship\s+with\s+([a-z][a-z'’-]{1,39})\b/i
    ];

    for (const pattern of patterns) {
      const match = compact.match(pattern);
      if (!match?.[1] || !match?.[2]) continue;
      const first = this.normalizeRelationshipName(match[1]);
      const second = this.normalizeRelationshipName(match[2]);
      if (!first || !second) continue;
      if (first.toLowerCase() === second.toLowerCase()) continue;
      return { people: [first, second], kind: 'relationship' };
    }

    return null;
  }

  private normalizeRelationshipName(raw: string): string | null {
    const cleaned = raw.replace(/^[^a-zA-Z]+|[^a-zA-Z'’-]+$/g, '');
    if (!cleaned) return null;
    const stopwords = new Set([
      'the',
      'a',
      'an',
      'this',
      'that',
      'someone',
      'somebody',
      'person',
      'people'
    ]);
    if (stopwords.has(cleaned.toLowerCase())) {
      return null;
    }

    return cleaned
      .split(/([-'’])/)
      .map((part) => {
        if (part === '-' || part === "'" || part === '’') return part;
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join('');
  }

  private extractPersonNamesFromTitle(text: string): string[] {
    const results: string[] = [];
    const matches = text.matchAll(
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:payment|task|todo|work|follow-up|followup|meeting|sync|review|draft|write|plan)\b/g
    );
    for (const match of matches) {
      const candidate = match[1];
      if (!candidate) continue;
      const sanitized = this.sanitizePersonCandidate(candidate);
      if (sanitized) {
        results.push(sanitized);
      }
    }
    return Array.from(new Set(results));
  }

  private sanitizePersonCandidate(value: string): string | null {
    const words = value
      .replace(/['"`.,:;!?()[\]{}]/g, ' ')
      .split(/\s+/)
      .map((word) => word.trim())
      .filter(Boolean);

    if (words.length === 0 || words.length > 3) {
      return null;
    }

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
      'delays',
      'for',
      'call',
      'email',
      'text',
      'ping',
      'meet',
      'meeting',
      'talk',
      'chat',
      'follow',
      'schedule',
      'remind',
      'pay'
    ]);

    if (words.some((word) => stopwords.has(word.toLowerCase()))) {
      return null;
    }

    const hasCapitalized = words.some((word) => /^(?:[A-Z][a-z].*|[A-Z]{2,})$/.test(word));
    if (!hasCapitalized) {
      return null;
    }

    const normalized = words
      .map((word) => {
        if (word.length <= 3 && word.toUpperCase() === word) {
          return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
      })
      .join(' ');

    return normalized.length > 1 ? normalized : null;
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

    if (isTaskCategory(category)) {
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
  private async handleDeleteEntry(
    args: Record<string, unknown>,
    channel: Channel,
    context?: ContextWindow
  ): Promise<ToolResult> {
    const path = args.path as string;
    const preResolution = await this.resolveMutationPathBeforeMutation(path, {
      operation: 'delete',
      channel,
      context
    });
    let resolvedPath = preResolution.path;

    // 1. Read entry first to get name for response (Requirement 3.3)
    // This will throw EntryNotFoundError if entry doesn't exist (Requirement 3.4)
    let existing: EntryWithPath;
    try {
      existing = await this.entryService.read(resolvedPath);
    } catch (error) {
      const resolved = await this.resolveMutationSourcePath(
        resolvedPath,
        {
          operation: 'delete',
          channel,
          context,
          error
        }
      );
      if (!resolved) {
        throw error;
      }
      resolvedPath = resolved.path;
      existing = await this.entryService.read(resolved.path);
    }
    const category = existing.category;
    
    // Get name based on category type
    // Inbox entries use suggested_name, other categories use name
    const name = category === 'inbox'
      ? (existing.entry as import('../types/entry.types').InboxEntry).suggested_name
      : (existing.entry as import('../types/entry.types').BaseEntry).name;

    // 2. Delete the entry (Requirement 3.2)
    // EntryService.delete() handles index regeneration and git commit (Requirement 3.5)
    await this.entryService.delete(resolvedPath, channel);
    const deleteVerification = await this.verifyDeleteMutation(resolvedPath);
    if (!deleteVerification.verified) {
      return {
        success: false,
        error: `Mutation verification failed: ${deleteVerification.checks.join(' | ')}`
      };
    }

    // 3. Return DeleteEntryResult with path and name (Requirement 3.3)
    const result: DeleteEntryResult = {
      path: resolvedPath,
      name,
      category,
      receipt: this.buildMutationReceipt('delete', path, resolvedPath, deleteVerification)
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

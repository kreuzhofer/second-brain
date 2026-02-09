/**
 * Chat Service
 * Orchestrates the chat message processing flow including classification,
 * entry creation, and response generation.
 * 
 * Requirements 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4
 * Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 (LLM Tool Routing)
 */

import OpenAI from 'openai';
import { getConfig } from '../config/env';
import {
  ChatResponse,
  Conversation,
  Message,
  ClassificationResult,
  ContextWindow,
  QuickReplyOption,
} from '../types/chat.types';
import { Category, Channel } from '../types/entry.types';
import { ConversationService, getConversationService } from './conversation.service';
import { ContextAssembler, getContextAssembler } from './context.service';
import { ClassificationAgent, getClassificationAgent } from './classification.service';
import { SummarizationService, getSummarizationService } from './summarization.service';
import { EntryService, getEntryService } from './entry.service';
import { ToolRegistry, getToolRegistry } from './tool-registry';
import { ToolExecutor, getToolExecutor, CaptureResult } from './tool-executor';
import { buildSystemPrompt } from './system-prompt';
import { generateSlug } from '../utils/slug';
import { normalizeDueDate } from '../utils/date';
import { isTaskCategory, toCanonicalCategory } from '../utils/category';

// ============================================
// Constants
// ============================================

/**
 * @deprecated Course correction is now handled by LLM tool selection (move_entry tool)
 * Kept for backward compatibility reference only.
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
 * @deprecated Category aliases are now handled by LLM tool selection
 * Kept for backward compatibility reference only.
 */
const CATEGORY_ALIASES: Record<string, Category> = {
  'person': 'people',
  'people': 'people',
  'project': 'projects',
  'projects': 'projects',
  'idea': 'ideas',
  'ideas': 'ideas',
  'task': 'task',
  'admin': 'task',
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
  private toolRegistry: ToolRegistry;
  private toolExecutor: ToolExecutor;
  private openai: OpenAI;
  private confidenceThreshold: number;
  private toolCallModel: string;
  private finalResponseModel: string;

  constructor(
    conversationService?: ConversationService,
    contextAssembler?: ContextAssembler,
    classificationAgent?: ClassificationAgent,
    summarizationService?: SummarizationService,
    entryService?: EntryService,
    toolRegistry?: ToolRegistry,
    toolExecutor?: ToolExecutor,
    openaiClient?: OpenAI
  ) {
    const config = getConfig();
    this.conversationService = conversationService ?? getConversationService();
    this.contextAssembler = contextAssembler ?? getContextAssembler();
    this.classificationAgent = classificationAgent ?? getClassificationAgent();
    this.summarizationService = summarizationService ?? getSummarizationService();
    this.entryService = entryService ?? getEntryService();
    this.toolRegistry = toolRegistry ?? getToolRegistry();
    this.toolExecutor = toolExecutor ?? getToolExecutor();
    this.openai = openaiClient ?? new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.confidenceThreshold = config.CONFIDENCE_THRESHOLD;
    this.toolCallModel = config.OPENAI_MODEL_CHAT_TOOL_CALL || 'gpt-4o-mini';
    this.finalResponseModel = config.OPENAI_MODEL_CHAT_FINAL_RESPONSE || 'gpt-4o-mini';
  }

  /**
   * Process a user message and return the assistant response.
   * 
   * This method now delegates to processMessageWithTools which uses LLM tool routing
   * to determine the appropriate action based on user intent.
   * 
   * Requirements 2.7: Remove hardcoded course correction regex patterns
   * Requirements 4.1: Classify and route based on confidence (via classify_and_capture tool)
   * Requirements 4.2: High confidence -> category folder
   * Requirements 4.3: Low confidence -> inbox with clarification
   * Requirements 4.4: Generate appropriate response
   * 
   * Note: The hints parameter is handled naturally by the LLM through the system prompt
   * and classify_and_capture tool's hints parameter.
   */
  async processMessage(
    conversationId: string | null,
    message: string,
    hints?: string,
    channel: Channel = 'chat'
  ): Promise<ChatResponse> {
    // Delegate to the new tool-based flow
    // Note: hints are handled naturally by the LLM through the system prompt
    // The LLM will extract hints from the message and pass them to classify_and_capture
    return this.processMessageWithTools(conversationId, message, channel);
  }

  /**
   * Process a user message with LLM tool routing.
   * 
   * This method uses OpenAI function calling to let the LLM decide which tool(s)
   * to invoke based on user intent, or respond conversationally without tools.
   * 
   * Requirements 2.1: Send message to OpenAI with all available tool schemas
   * Requirements 2.2: Execute tool when LLM returns a tool call
   * Requirements 2.3: Execute multiple tool calls in sequence
   * Requirements 2.4: Return LLM's conversational response when no tool is called
   * Requirements 2.5: Send tool results back to LLM for response generation
   * Requirements 2.6: Return error message to LLM on tool failure
   */
  async processMessageWithTools(
    conversationId: string | null,
    message: string,
    channel: Channel = 'chat'
  ): Promise<ChatResponse> {
    // 1. Get or create conversation
    const conversation = conversationId
      ? await this.conversationService.getById(conversationId)
      : await this.conversationService.create(channel);

    if (!conversation) {
      throw new ChatServiceError('Failed to get or create conversation');
    }

    // 2. Store user message
    await this.conversationService.addMessage(
      conversation.id,
      'user',
      message
    );

    // 3. Assemble context using existing ContextAssembler
    const context = await this.contextAssembler.assemble(conversation.id);

    const pendingFollowUpResponse = await this.tryHandlePendingFollowUp(
      conversation.id,
      message,
      channel,
      context
    );
    if (pendingFollowUpResponse) {
      return pendingFollowUpResponse;
    }

    // 4. Build system prompt with tool schemas
    // Format conversation history for the system prompt
    const conversationHistory = this.formatConversationHistory(
      context.summaries,
      context.recentMessages
    );
    const systemPrompt = buildSystemPrompt(context.indexContent, conversationHistory);

    // 5. Get tool definitions from ToolRegistry
    const tools = this.toolRegistry.getAllTools();

    // 6. Build messages array for OpenAI
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: message }
    ];

    // 7. Call OpenAI with tools parameter
    let response = await this.openai.chat.completions.create({
      model: this.toolCallModel,
      messages,
      tools,
      tool_choice: 'auto'
    });

    let assistantMessageContent = response.choices[0]?.message?.content;
    const toolCalls = response.choices[0]?.message?.tool_calls;
    const filteredToolCalls = this.filterToolCallsForIntent(message, toolCalls || []);
    const toolsUsed: string[] = [];
    let entryInfo: { path: string; category: Category; name: string; confidence: number } | undefined;
    let captureResponseOverride: string | undefined;
    const toolErrors: Array<{ name: string; error: string }> = [];

    // 8. Handle tool_calls response by executing tools via ToolExecutor
    if (filteredToolCalls.length > 0) {
      // Execute each tool call and collect results
      const toolResults: OpenAI.Chat.ChatCompletionToolMessageParam[] = [];

      for (const toolCall of filteredToolCalls) {
        // Only handle function tool calls (not custom tool calls)
        if (toolCall.type !== 'function') {
          continue;
        }
        
        const toolName = toolCall.function.name;
        toolsUsed.push(toolName);

        let toolArgs: Record<string, unknown>;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          // If JSON parsing fails, send error back to LLM
          toolResults.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: JSON.stringify({ success: false, error: 'Invalid JSON arguments' })
          });
          continue;
        }

        // Execute the tool
        const result = await this.toolExecutor.execute(
          {
            name: toolName,
            arguments: toolArgs
          },
          { channel, context }
        );

        if (!result.success && result.error) {
          toolErrors.push({ name: toolName, error: result.error });
        }

        // If this was classify_and_capture and it succeeded, capture entry info
        if (toolName === 'classify_and_capture' && result.success && result.data) {
          const captureResult = result.data as CaptureResult;
          if (!captureResult.queued) {
            entryInfo = {
              path: captureResult.path,
              category: captureResult.category,
              name: captureResult.name,
              confidence: captureResult.confidence
            };
          }
          if (captureResult.captureKind === 'people_relationship' && captureResult.relatedPeople?.length) {
            captureResponseOverride = this.buildRelationshipCaptureResponse(captureResult.relatedPeople);
          }
        }
        if (toolName === 'classify_and_capture' && !result.success && result.error) {
          const duplicateCaptureResponse = this.buildDuplicateCaptureResponse(result.error);
          if (duplicateCaptureResponse) {
            captureResponseOverride = duplicateCaptureResponse;
          }
        }

        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        });
      }

      const shouldAttemptReopenFallback = this.shouldAttemptReopenFallback(message, toolErrors);
      if (shouldAttemptReopenFallback) {
        const fallbackMessage = await this.buildReopenFallbackMessage(message);
        if (fallbackMessage) {
          assistantMessageContent = fallbackMessage;
        }
      }

      // 9. Send tool results back to OpenAI for final response
      if (!assistantMessageContent || !this.isReopenFallbackMessage(assistantMessageContent)) {
        if (captureResponseOverride) {
          assistantMessageContent = captureResponseOverride;
        } else {
        const messagesWithToolResults: OpenAI.Chat.ChatCompletionMessageParam[] = [
          ...messages,
          response.choices[0].message,
          ...toolResults
        ];

        const finalResponse = await this.openai.chat.completions.create({
          model: this.finalResponseModel,
          messages: messagesWithToolResults
        });

        assistantMessageContent = finalResponse.choices[0]?.message?.content || '';
        }
      }
    }

    // 10. Handle conversational response (no tools) - content is already set
    if (filteredToolCalls.length === 0 && this.shouldAttemptReopenFallback(message, toolErrors)) {
      const fallbackMessage = await this.buildReopenFallbackMessage(message);
      if (fallbackMessage) {
        assistantMessageContent = fallbackMessage;
      }
    }

    // Ensure we have content
    if (!assistantMessageContent) {
      assistantMessageContent = "I'm sorry, I couldn't generate a response. Please try again.";
    }

    // 11. Store assistant message with entry metadata if applicable
    const quickReplies = this.buildQuickReplies(assistantMessageContent);
    const assistantMessage = await this.conversationService.addMessage(
      conversation.id,
      'assistant',
      assistantMessageContent,
      entryInfo?.path,
      entryInfo?.confidence
    );

    // 12. Check for summarization
    await this.summarizationService.checkAndSummarize(conversation.id);

    // 13. Return ChatResponse
    return {
      conversationId: conversation.id,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content: assistantMessageContent,
        filedEntryPath: entryInfo?.path,
        filedConfidence: entryInfo?.confidence,
        quickReplies,
        createdAt: assistantMessage.createdAt,
      },
      entry: entryInfo,
      clarificationNeeded: entryInfo?.category === 'inbox',
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined
    } as ChatResponse;
  }

  /**
   * Format conversation history for the system prompt.
   * Combines summaries and recent messages into a readable format.
   */
  private formatConversationHistory(
    summaries: { summary: string }[],
    recentMessages: Message[]
  ): string {
    const parts: string[] = [];

    // Add summaries
    if (summaries.length > 0) {
      parts.push('Previous conversation summaries:');
      for (const summary of summaries) {
        parts.push(`- ${summary.summary}`);
      }
      parts.push('');
    }

    // Add recent messages
    if (recentMessages.length > 0) {
      parts.push('Recent messages:');
      for (const msg of recentMessages) {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        parts.push(`${role}: ${msg.content}`);
      }
    }

    return parts.join('\n');
  }

  private shouldAttemptReopenFallback(
    message: string,
    toolErrors: Array<{ name: string; error: string }>
  ): boolean {
    if (!this.isReopenIntent(message)) {
      return false;
    }
    if (toolErrors.length === 0) {
      return true;
    }
    return toolErrors.some((err) => /not found/i.test(err.error));
  }

  private filterToolCallsForIntent(
    message: string,
    toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[]
  ): OpenAI.Chat.ChatCompletionMessageToolCall[] {
    if (!toolCalls || toolCalls.length <= 1) {
      return toolCalls;
    }

    const hasMove = toolCalls.some((call) => call.type === 'function' && call.function.name === 'move_entry');
    const hasCapture = toolCalls.some((call) => call.type === 'function' && call.function.name === 'classify_and_capture');
    if (!hasMove || !hasCapture) {
      return toolCalls;
    }

    if (!this.isReclassificationIntent(message)) {
      return toolCalls;
    }

    // For reclassification, prefer moving existing entries over capturing duplicates.
    return toolCalls.filter((call) => call.type !== 'function' || call.function.name !== 'classify_and_capture');
  }

  private isReclassificationIntent(message: string): boolean {
    const text = message.toLowerCase();
    return (
      /\bmake\b.+\b(admin(?: task)?|project|idea|person|inbox)\b/i.test(message) ||
      /\bmove\b.+\bto\b.+\b(admin(?: task)?|project|idea|person|inbox)\b/i.test(message) ||
      /\b(reclassify|re-classify|convert)\b/i.test(text) ||
      /\bactually\b.+\b(should be|belongs in)\b/i.test(text)
    );
  }

  private isReopenIntent(message: string): boolean {
    const text = message.toLowerCase();
    return [
      'reopen',
      're-open',
      'bring back',
      'undo',
      'unmark',
      'mark back',
      'set back',
      'restore',
      'put back',
      'move back'
    ].some((phrase) => text.includes(phrase))
      || /mark\s+.*(pending|todo|to do|in progress)/i.test(message);
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(' ')
      .filter((token) => token.length > 1);
  }

  private scoreEntryMatch(message: string, entryName: string): number {
    const messageTokens = new Set(this.tokenize(message));
    const entryTokens = this.tokenize(entryName);
    const overlap = entryTokens.filter((token) => messageTokens.has(token)).length;
    const messageLower = message.toLowerCase();
    const entryLower = entryName.toLowerCase();
    const substringBoost = messageLower.includes(entryLower) ? entryTokens.length + 2 : 0;
    return Math.max(overlap, substringBoost);
  }

  private async buildReopenFallbackMessage(message: string): Promise<string | null> {
    const doneTasks = await this.entryService.list('task', { status: 'done' });
    if (doneTasks.length === 0) {
      return null;
    }

    const scored = doneTasks
      .map((entry) => ({
        entry,
        score: this.scoreEntryMatch(message, entry.name)
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return null;
    }

    const top = scored[0];
    const second = scored[1];
    const isClearWinner = !second || top.score > second.score;

    if (isClearWinner) {
      return `I found a completed task that looks like a match: "${top.entry.name}" (${top.entry.path}). Want me to set it back to pending?`;
    }

    const topCandidates = scored.slice(0, 3);
    const list = topCandidates
      .map((item, index) => `${index + 1}. ${item.entry.name} (${item.entry.path})`)
      .join('\n');
    return `I found multiple completed tasks that could match. Which one should I reopen?\n${list}`;
  }

  private isReopenFallbackMessage(message: string): boolean {
    return message.startsWith('I found a completed task') || message.startsWith('I found multiple completed tasks');
  }

  private async tryHandlePendingFollowUp(
    conversationId: string,
    message: string,
    channel: Channel,
    context: ContextWindow
  ): Promise<ChatResponse | null> {
    const reopenSelectionResponse = await this.tryHandleReopenSelectionFollowUp(
      conversationId,
      message,
      channel,
      context
    );
    if (reopenSelectionResponse) {
      return reopenSelectionResponse;
    }

    const reopenConfirmResponse = await this.tryHandleReopenConfirmationFollowUp(
      conversationId,
      message,
      channel,
      context
    );
    if (reopenConfirmResponse) {
      return reopenConfirmResponse;
    }

    const sourceMessage = this.extractPendingCaptureSource(context.recentMessages);
    if (!sourceMessage) {
      return null;
    }

    if (this.isCaptureDecline(message)) {
      const declineText = "Okay, I won't save it.";
      const assistantMessage = await this.conversationService.addMessage(
        conversationId,
        'assistant',
        declineText
      );
      await this.summarizationService.checkAndSummarize(conversationId);
      return {
        conversationId,
        message: {
          id: assistantMessage.id,
          role: 'assistant',
          content: declineText,
          createdAt: assistantMessage.createdAt
        },
        clarificationNeeded: false
      } as ChatResponse;
    }

    if (!this.isCaptureConfirmation(message)) {
      return null;
    }

    const hints = this.extractCategoryHintFromConfirmation(message);
    const result = await this.toolExecutor.execute(
      {
        name: 'classify_and_capture',
        arguments: hints
          ? { text: sourceMessage, hints }
          : { text: sourceMessage }
      },
      { channel, context }
    );

    if (!result.success || !result.data) {
      return null;
    }

    const captureResult = result.data as CaptureResult;
    const entryInfo = captureResult.queued
      ? undefined
      : {
          path: captureResult.path,
          category: captureResult.category,
          name: captureResult.name,
          confidence: captureResult.confidence
        };

    const responseText = this.buildFollowUpCaptureResponse(captureResult);
    const assistantMessage = await this.conversationService.addMessage(
      conversationId,
      'assistant',
      responseText,
      entryInfo?.path,
      entryInfo?.confidence
    );

    await this.summarizationService.checkAndSummarize(conversationId);

    return {
      conversationId,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content: responseText,
        filedEntryPath: entryInfo?.path,
        filedConfidence: entryInfo?.confidence,
        createdAt: assistantMessage.createdAt
      },
      entry: entryInfo,
      clarificationNeeded: entryInfo?.category === 'inbox',
      toolsUsed: ['classify_and_capture']
    } as ChatResponse;
  }

  private async tryHandleReopenConfirmationFollowUp(
    conversationId: string,
    message: string,
    channel: Channel,
    context: ContextWindow
  ): Promise<ChatResponse | null> {
    const lastPrompt = this.findLatestAssistantPrompt(
      context.recentMessages,
      (content) => content.startsWith('I found a completed task that looks like a match:')
    );
    if (!lastPrompt) {
      return null;
    }

    if (this.isCaptureDecline(message)) {
      return this.buildSimpleAssistantResponse(
        conversationId,
        "Okay, I won't reopen it."
      );
    }

    if (!this.isCaptureConfirmation(message)) {
      return null;
    }

    const pathMatch = lastPrompt.content.match(/\(([^()\s]+\/[^()\s]+)\)/);
    const path = pathMatch?.[1];
    if (!path) {
      return this.buildSimpleAssistantResponse(
        conversationId,
        "I couldn't parse which task to reopen. Please tell me the task name."
      );
    }

    const result = await this.toolExecutor.execute(
      {
        name: 'update_entry',
        arguments: {
          path,
          updates: { status: 'pending' }
        }
      },
      { channel, context }
    );

    if (!result.success || !result.data) {
      const errorText = result.error || 'Unknown error';
      return this.buildSimpleAssistantResponse(
        conversationId,
        `I couldn't reopen that task: ${errorText}`
      );
    }

    const data = result.data as {
      path?: string;
      category?: Category;
      name?: string;
      confidence?: number;
    };
    const entryPath = data.path || path;
    const entryName = data.name || this.extractNameFromReopenPrompt(lastPrompt.content) || entryPath;
    const responseText = `Done. I set "${entryName}" back to pending. You can find it at ${entryPath}.`;

    const assistantMessage = await this.conversationService.addMessage(
      conversationId,
      'assistant',
      responseText,
      entryPath,
      typeof data.confidence === 'number' ? data.confidence : undefined
    );
    await this.summarizationService.checkAndSummarize(conversationId);

    return {
      conversationId,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content: responseText,
        filedEntryPath: entryPath,
        filedConfidence: typeof data.confidence === 'number' ? data.confidence : undefined,
        createdAt: assistantMessage.createdAt
      },
      entry: {
        path: entryPath,
        category: toCanonicalCategory((data.category || 'task') as string),
        name: entryName,
        confidence: typeof data.confidence === 'number' ? data.confidence : 1
      },
      clarificationNeeded: false,
      toolsUsed: ['update_entry']
    } as ChatResponse;
  }

  private async tryHandleReopenSelectionFollowUp(
    conversationId: string,
    message: string,
    channel: Channel,
    context: ContextWindow
  ): Promise<ChatResponse | null> {
    const lastPrompt = this.findLatestAssistantPrompt(
      context.recentMessages,
      (content) => content.startsWith('I found multiple completed tasks that could match.')
    );
    if (!lastPrompt) {
      return null;
    }

    if (this.isCaptureDecline(message)) {
      return this.buildSimpleAssistantResponse(
        conversationId,
        "Okay, I won't reopen anything."
      );
    }

    const options = this.parseNumberedReopenOptions(lastPrompt.content);
    if (options.length === 0) {
      return null;
    }

    const selectedPath = this.resolveReopenSelectionPath(message, options);
    if (!selectedPath) {
      if (this.isCaptureConfirmation(message)) {
        const prompt = 'Please choose one option by number.';
        const assistantMessage = await this.conversationService.addMessage(
          conversationId,
          'assistant',
          prompt
        );
        await this.summarizationService.checkAndSummarize(conversationId);
        return {
          conversationId,
          message: {
            id: assistantMessage.id,
            role: 'assistant',
            content: prompt,
            quickReplies: options.slice(0, 3).map((option, index) => ({
              id: `select_${index + 1}`,
              label: `Use #${index + 1}`,
              message: `${index + 1}`
            })),
            createdAt: assistantMessage.createdAt
          },
          clarificationNeeded: true
        } as ChatResponse;
      }
      return null;
    }

    const result = await this.toolExecutor.execute(
      {
        name: 'update_entry',
        arguments: {
          path: selectedPath,
          updates: { status: 'pending' }
        }
      },
      { channel, context }
    );

    if (!result.success || !result.data) {
      const errorText = result.error || 'Unknown error';
      return this.buildSimpleAssistantResponse(
        conversationId,
        `I couldn't reopen that task: ${errorText}`
      );
    }

    const data = result.data as {
      path?: string;
      category?: Category;
      name?: string;
      confidence?: number;
    };
    const entryPath = data.path || selectedPath;
    const entryName = data.name || options.find((o) => o.path === selectedPath)?.name || entryPath;
    const responseText = `Done. I set "${entryName}" back to pending. You can find it at ${entryPath}.`;

    const assistantMessage = await this.conversationService.addMessage(
      conversationId,
      'assistant',
      responseText,
      entryPath,
      typeof data.confidence === 'number' ? data.confidence : undefined
    );
    await this.summarizationService.checkAndSummarize(conversationId);

    return {
      conversationId,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content: responseText,
        filedEntryPath: entryPath,
        filedConfidence: typeof data.confidence === 'number' ? data.confidence : undefined,
        createdAt: assistantMessage.createdAt
      },
      entry: {
        path: entryPath,
        category: toCanonicalCategory((data.category || 'task') as string),
        name: entryName,
        confidence: typeof data.confidence === 'number' ? data.confidence : 1
      },
      clarificationNeeded: false,
      toolsUsed: ['update_entry']
    } as ChatResponse;
  }

  private async buildSimpleAssistantResponse(
    conversationId: string,
    content: string
  ): Promise<ChatResponse> {
    const assistantMessage = await this.conversationService.addMessage(
      conversationId,
      'assistant',
      content
    );
    await this.summarizationService.checkAndSummarize(conversationId);
    return {
      conversationId,
      message: {
        id: assistantMessage.id,
        role: 'assistant',
        content,
        createdAt: assistantMessage.createdAt
      },
      clarificationNeeded: false
    } as ChatResponse;
  }

  private findLatestAssistantPrompt(
    recentMessages: Message[],
    predicate: (content: string) => boolean
  ): Message | null {
    if (!recentMessages || recentMessages.length < 2) {
      return null;
    }
    const maxLookback = 12;
    const start = Math.max(0, recentMessages.length - 1 - maxLookback);
    for (let i = recentMessages.length - 2; i >= start; i -= 1) {
      const msg = recentMessages[i];
      if (msg.role === 'assistant' && predicate(msg.content)) {
        return msg;
      }
    }
    return null;
  }

  private extractPendingCaptureSource(recentMessages: Message[]): string | null {
    if (!recentMessages || recentMessages.length < 3) {
      return null;
    }

    const maxLookback = 14;
    const end = recentMessages.length - 1;
    const start = Math.max(1, end - maxLookback);
    for (let i = end - 1; i >= start; i -= 1) {
      const candidate = recentMessages[i];
      if (!candidate || candidate.role !== 'assistant' || !this.isCapturePrompt(candidate.content)) {
        continue;
      }
      for (let j = i - 1; j >= 0; j -= 1) {
        const prev = recentMessages[j];
        if (prev.role === 'user' && prev.content.trim().length > 0) {
          return prev.content;
        }
      }
    }
    return null;
  }

  private isCapturePrompt(content: string): boolean {
    const text = content.toLowerCase();
    return (
      text.includes('would you like me to capture') ||
      text.includes('want me to capture') ||
      text.includes('would you like me to save') ||
      text.includes('want me to save') ||
      text.includes('capture that as') ||
      text.includes('save that as') ||
      (text.includes('would you like me') && text.includes('capture'))
    );
  }

  private isCaptureConfirmation(message: string): boolean {
    const text = message.trim().toLowerCase();
    if (text.length === 0) return false;
    if (/\b(no|nope|nah|don['’]?t|do not|stop|cancel)\b/i.test(text)) {
      return false;
    }
    return (
      /\b(yes|yeah|yep|sure|ok|okay|please do|do it|go ahead|save it|capture it)\b/i.test(text) ||
      /\bas\s+an?\s+(admin(?:\s+task)?|task|project|idea|person|people|inbox)\b/i.test(text)
    );
  }

  private isCaptureDecline(message: string): boolean {
    const text = message.trim().toLowerCase();
    return /\b(no|nope|nah|don['’]?t|do not|stop|cancel)\b/i.test(text);
  }

  private extractCategoryHintFromConfirmation(message: string): string | undefined {
    const text = message.toLowerCase();
    if (/\b(admin(?:\s+task)?|task)\b/.test(text)) return '[task]';
    if (/\bproject\b/.test(text)) return '[project]';
    if (/\bidea\b/.test(text)) return '[idea]';
    if (/\b(person|people)\b/.test(text)) return '[person]';
    if (/\binbox\b/.test(text)) return '[inbox]';
    return undefined;
  }

  private buildFollowUpCaptureResponse(result: CaptureResult): string {
    if (result.queued) {
      return result.message || 'I queued that capture and will process it when the model is available.';
    }
    let typeLabel = isTaskCategory(result.category) ? 'task' : result.category.slice(0, -1);
    if (result.category === 'inbox') {
      typeLabel = 'inbox item';
    }
    return `Done. I captured "${result.name}" as a ${typeLabel}. You can find it at ${result.path}.`;
  }

  private buildRelationshipCaptureResponse(people: string[]): string {
    const unique = Array.from(new Set(people.map((name) => name.trim()).filter((name) => name.length > 0)));
    if (unique.length < 2) {
      return `Done. I captured the relationship details and linked the relevant people entries.`;
    }
    const text = unique.length === 2
      ? `${unique[0]} and ${unique[1]}`
      : `${unique.slice(0, -1).join(', ')}, and ${unique[unique.length - 1]}`;
    return `Done. I captured that ${text} have a relationship, created or reused both people entries, and linked them in the graph.`;
  }

  private buildDuplicateCaptureResponse(error: string): string | null {
    if (!/already exists/i.test(error)) {
      return null;
    }

    const pathMatch = error.match(/([a-z]+\/[a-z0-9-]+)/i);
    const path = pathMatch?.[1];

    if (path) {
      return `You already have this entry at ${path}. I did not create a duplicate. Want me to update the existing entry instead?`;
    }

    return 'This entry already exists. I did not create a duplicate. Want me to update the existing entry instead?';
  }

  private buildQuickReplies(content: string): QuickReplyOption[] | undefined {
    const disambiguationReplies = this.buildDisambiguationQuickReplies(content);
    if (disambiguationReplies) {
      return disambiguationReplies;
    }

    const lower = content.toLowerCase();
    if (this.isCapturePrompt(content)) {
      return [
        { id: 'capture_task', label: 'Yes, task', message: 'Yes as a task' },
        { id: 'capture_project', label: 'Yes, project', message: 'Yes as a project' },
        { id: 'capture_idea', label: 'Yes, idea', message: 'Yes as an idea' },
        { id: 'capture_no', label: 'No', message: 'No, do not save that' }
      ];
    }
    if (lower.includes('would you like me') || lower.includes('want me to')) {
      return [
        { id: 'confirm_yes', label: 'Yes', message: 'Yes' },
        { id: 'confirm_no', label: 'No', message: 'No' }
      ];
    }
    return undefined;
  }

  private buildDisambiguationQuickReplies(content: string): QuickReplyOption[] | undefined {
    const matches = Array.from(content.matchAll(/^\s*(\d+)\.\s+/gm));
    if (matches.length < 2) {
      return undefined;
    }
    return matches
      .slice(0, 3)
      .map((match) => match[1])
      .filter((num) => num.length > 0)
      .map((num) => ({
        id: `select_${num}`,
        label: `Use #${num}`,
        message: num
      }));
  }

  private extractNameFromReopenPrompt(content: string): string | null {
    const match = content.match(/match:\s*"(.+?)"/i);
    return match?.[1] || null;
  }

  private parseNumberedReopenOptions(content: string): Array<{ index: number; name: string; path: string }> {
    const lines = content.split('\n');
    const options: Array<{ index: number; name: string; path: string }> = [];
    for (const line of lines) {
      const match = line.match(/^\s*(\d+)\.\s+(.+?)\s+\(([^()\s]+\/[^()\s]+)\)\s*$/);
      if (!match) {
        continue;
      }
      options.push({
        index: Number(match[1]),
        name: match[2].trim(),
        path: match[3].trim()
      });
    }
    return options;
  }

  private resolveReopenSelectionPath(
    message: string,
    options: Array<{ index: number; name: string; path: string }>
  ): string | null {
    const numberMatch = message.match(/(?:^|\D)(\d+)(?:\D|$)/);
    if (numberMatch) {
      const idx = Number(numberMatch[1]);
      const selected = options.find((option) => option.index === idx);
      if (selected) {
        return selected.path;
      }
    }

    const lower = message.toLowerCase();
    const byPath = options.find((option) => lower.includes(option.path.toLowerCase()));
    if (byPath) {
      return byPath.path;
    }
    const byName = options.find((option) => lower.includes(option.name.toLowerCase()));
    if (byName) {
      return byName.path;
    }
    return null;
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
   * @deprecated Course correction is now handled by LLM tool selection (move_entry tool).
   * This method is kept for backward compatibility but is no longer called by processMessage.
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
   * @deprecated Course correction is now handled by LLM tool selection (move_entry tool).
   * This method is kept for backward compatibility but is no longer called by processMessage.
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
    const entryData = this.buildEntryData(classification, originalText);
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
  private buildEntryData(classification: ClassificationResult, originalText: string): any {
    const baseData = {
      name: classification.name,
      tags: [],
      confidence: classification.confidence,
    };

    const fields = classification.fields as any;
    const normalizedDueDate = normalizeDueDate(
      fields.dueDate || fields.due_date,
      originalText
    );

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
          due_date: normalizedDueDate,
        };
      case 'ideas':
        return {
          ...baseData,
          one_liner: fields.oneLiner || '',
          related_projects: fields.relatedProjects || [],
        };
      case 'task':
      case 'admin':
        return {
          ...baseData,
          status: fields.status || 'pending',
          due_date: normalizedDueDate,
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
    const newPath = `${targetCategory}/${slug}`;

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
      case 'task':
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

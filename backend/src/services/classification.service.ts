/**
 * Classification Agent Service
 * LLM-powered classification agent that analyzes user input and determines
 * category, fields, and confidence for JustDo.so.
 * Uses OpenAI API with structured JSON output for reliable parsing.
 */

import OpenAI from 'openai';
import { getConfig } from '../config/env';
import {
  ClassificationInput,
  ClassificationResult,
  CategoryFields,
  PeopleFields,
  ProjectsFields,
  IdeasFields,
  AdminFields,
  ContextWindow,
} from '../types/chat.types';
import { CLASSIFICATION_SYSTEM_PROMPT } from './context.service';
import { getCurrentDateString } from '../utils/date';

// ============================================
// Constants
// ============================================

/**
 * Default timeout for OpenAI API calls (30 seconds)
 */
const DEFAULT_TIMEOUT_MS = 30000;

/**
 * JSON schema for classification response
 * Used to instruct the LLM on the expected output format
 */
const CLASSIFICATION_SCHEMA = `{
  "category": "people" | "projects" | "ideas" | "task",
  "confidence": 0.0-1.0,
  "name": "Short descriptive title",
  "slug": "url-safe-lowercase-slug",
  "fields": {
    // For people: { "context": string, "followUps": string[], "relatedProjects": string[] }
    // For projects: { "status": "active"|"waiting"|"blocked"|"someday", "nextAction": string, "relatedPeople": string[], "dueDate"?: string }
    // For ideas: { "oneLiner": string, "relatedProjects": string[] }
    // For task: { "status": "pending", "dueDate"?: string, "dueAt"?: string, "durationMinutes"?: number, "fixedAt"?: string, "relatedPeople": string[] }
  },
  "related_entries": ["slug1", "slug2"],
  "reasoning": "Brief explanation of classification decision",
  "body_content": "Markdown body content with appropriate sections"
}`;

/**
 * Body content generation guidelines by category
 * Used to instruct the LLM on how to generate body content for each category
 */
const BODY_CONTENT_GUIDELINES = `
Body Content Generation Guidelines:
Generate appropriate markdown body content based on the category. Extract and organize information intelligently - do NOT simply copy the raw input text verbatim.

- people: Generate a "## Notes" section with observations about the person, their preferences, communication style, or any relevant context from the input.
- projects: Generate a "## Notes" section for project context and background. Optionally include a "## Log" section for timeline entries if the input mentions specific events or milestones.
- ideas: Generate a "## Elaboration" section that expands on the concept, explores implications, or adds structure to the idea.
- task: Generate a "## Notes" section ONLY if the input contains additional context beyond the task itself. If the input is just a simple task with no extra context, return an empty string for body_content.

If the input text contains no additional context worth capturing in the body, return an empty string for body_content.
`;

// ============================================
// Custom Errors
// ============================================

/**
 * Error thrown when classification fails
 */
export class ClassificationError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'ClassificationError';
  }
}

/**
 * Error thrown when OpenAI API call fails
 */
export class ClassificationAPIError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'ClassificationAPIError';
  }
}

/**
 * Error thrown when classification times out
 */
export class ClassificationTimeoutError extends Error {
  constructor(message: string = 'Classification request timed out') {
    super(message);
    this.name = 'ClassificationTimeoutError';
  }
}

/**
 * Error thrown when LLM returns invalid JSON
 */
export class InvalidClassificationResponseError extends Error {
  constructor(message: string, public readonly rawResponse?: string) {
    super(message);
    this.name = 'InvalidClassificationResponseError';
  }
}

// ============================================
// Classification Agent Class
// ============================================

export class ClassificationAgent {
  private openai: OpenAI;
  private timeoutMs: number;
  private model: string;

  constructor(openaiClient?: OpenAI, timeoutMs?: number) {
    const config = getConfig();
    this.openai = openaiClient ?? new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.model = config.OPENAI_MODEL_CLASSIFICATION || 'gpt-4o-mini';
  }

  /**
   * Classify a thought and return structured result.
   * 
   * Requirements 3.1: Analyze the text and return a classification result
   * Requirements 3.2: Return JSON object with category, name, slug, fields, confidence, reasoning
   * Requirements 3.3: Classify into exactly one of: people, projects, ideas, or task
   * Requirements 3.4: Use current index.md content as context for classification decisions
   * 
   * @param input - The classification input containing text, hints, and context
   * @returns ClassificationResult with category, confidence, name, slug, fields, and reasoning
   * @throws ClassificationError if classification fails
   * @throws ClassificationAPIError if OpenAI API call fails
   * @throws ClassificationTimeoutError if request times out
   * @throws InvalidClassificationResponseError if LLM returns invalid JSON
   */
  async classify(input: ClassificationInput): Promise<ClassificationResult> {
    const prompt = this.buildClassificationPrompt(input);

    try {
      const response = await this.callOpenAIWithTimeout(prompt, input.context.systemPrompt);
      return this.parseClassificationResponse(response);
    } catch (error) {
      // Re-throw our custom errors
      if (
        error instanceof ClassificationError ||
        error instanceof ClassificationAPIError ||
        error instanceof ClassificationTimeoutError ||
        error instanceof InvalidClassificationResponseError
      ) {
        throw error;
      }

      // Handle OpenAI-specific errors
      if (error instanceof OpenAI.APIError) {
        throw new ClassificationAPIError(
          `OpenAI API error: ${error.message}`,
          error
        );
      }

      // Handle unknown errors
      throw new ClassificationError(
        `Classification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Build the classification prompt with context and user input.
   * 
   * @param input - The classification input
   * @returns The formatted prompt string
   */
  private buildClassificationPrompt(input: ClassificationInput): string {
    const { text, hints, context } = input;
    const today = getCurrentDateString();

    let prompt = `You are a classification agent for a personal knowledge management system.

Given a raw thought, classify it into one of these categories:
- people: Information about a specific person (contact, relationship, follow-ups)
- projects: Something with multiple steps, a goal, and a timeline
- ideas: A concept, insight, or potential future thing (no active commitment yet)
- task: A single task/errand with an optional deadline, optional fixed appointment time, and optional duration

Extract structured fields based on the category. Return JSON only.
Today's date is ${today}. Convert relative dates (e.g. today, tomorrow, next week) to YYYY-MM-DD.
For tasks, extract relatedPeople as an array of full names mentioned (empty array if none).
For tasks, infer durationMinutes when explicitly mentioned (e.g. "30 minute task"). Default to 30 when unspecified.
For tasks, use dueAt for date+time deadlines when present (e.g. "tomorrow by 3pm"), and dueDate when only date is known.
For tasks, use fixedAt when the user explicitly requests a fixed execution slot/time.

Schema:
${CLASSIFICATION_SCHEMA}

${BODY_CONTENT_GUIDELINES}

If the input is ambiguous or lacks context, set confidence below 0.6 and explain in reasoning.

Current index for context:
${context.indexContent || '(No existing entries)'}

`;

    // Add conversation context if available
    if (context.summaries.length > 0) {
      prompt += `\nConversation summaries:\n`;
      for (const summary of context.summaries) {
        prompt += `- ${summary.summary}\n`;
      }
    }

    if (context.recentMessages.length > 0) {
      prompt += `\nRecent conversation:\n`;
      for (const msg of context.recentMessages) {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        prompt += `${role}: ${msg.content}\n`;
      }
    }

    prompt += `\nUser input: ${text}`;

    if (hints) {
      prompt += `\nHints (if any): ${hints}`;
    }

    return prompt;
  }

  /**
   * Call OpenAI API with timeout handling.
   * 
   * @param prompt - The user prompt
   * @param systemPrompt - The system prompt
   * @returns The raw response content from OpenAI
   * @throws ClassificationTimeoutError if request times out
   * @throws ClassificationAPIError if API call fails
   */
  private async callOpenAIWithTimeout(
    prompt: string,
    systemPrompt: string
  ): Promise<string> {
    // Create abort controller for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.openai.chat.completions.create(
        {
          model: this.model,
          messages: [
            {
              role: 'system',
              content: systemPrompt,
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.3, // Lower temperature for more consistent classifications
          max_tokens: 1000,
        },
        {
          signal: controller.signal,
        }
      );

      const content = response.choices[0]?.message?.content;

      if (!content) {
        throw new ClassificationAPIError('OpenAI returned empty response');
      }

      return content;
    } catch (error) {
      // Check if it was an abort (timeout)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ClassificationTimeoutError();
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Parse and validate the classification response from OpenAI.
   * 
   * @param rawResponse - The raw JSON string from OpenAI
   * @returns Validated ClassificationResult
   * @throws InvalidClassificationResponseError if response is invalid
   */
  private parseClassificationResponse(rawResponse: string): ClassificationResult {
    let parsed: unknown;

    try {
      parsed = JSON.parse(rawResponse);
    } catch {
      throw new InvalidClassificationResponseError(
        'Failed to parse classification response as JSON',
        rawResponse
      );
    }

    // Validate the parsed response
    if (!this.isValidClassificationResponse(parsed)) {
      throw new InvalidClassificationResponseError(
        'Classification response missing required fields',
        rawResponse
      );
    }

    // Normalize the response to our interface
    const category = parsed.category === 'admin' ? 'task' : parsed.category;
    const result: ClassificationResult = {
      category,
      confidence: this.normalizeConfidence(parsed.confidence),
      name: String(parsed.name),
      slug: this.normalizeSlug(parsed.slug),
      fields: this.normalizeFields(category, parsed.fields),
      relatedEntries: this.normalizeRelatedEntries(parsed.related_entries),
      reasoning: String(parsed.reasoning || ''),
      bodyContent: this.normalizeBodyContent(parsed.body_content),
    };

    return result;
  }

  /**
   * Type guard to validate classification response structure.
   */
  private isValidClassificationResponse(
    response: unknown
  ): response is {
    category: 'people' | 'projects' | 'ideas' | 'task' | 'admin';
    confidence: number;
    name: string;
    slug: string;
    fields: Record<string, unknown>;
    related_entries?: string[];
    reasoning?: string;
    body_content?: string;
  } {
    if (typeof response !== 'object' || response === null) {
      return false;
    }

    const obj = response as Record<string, unknown>;

    // Check required fields
    if (!['people', 'projects', 'ideas', 'task', 'admin'].includes(obj.category as string)) {
      return false;
    }

    if (typeof obj.confidence !== 'number') {
      return false;
    }

    if (typeof obj.name !== 'string' || obj.name.length === 0) {
      return false;
    }

    if (typeof obj.slug !== 'string' || obj.slug.length === 0) {
      return false;
    }

    if (typeof obj.fields !== 'object' || obj.fields === null) {
      return false;
    }

    return true;
  }

  /**
   * Normalize confidence score to be within 0.0-1.0 range.
   */
  private normalizeConfidence(confidence: number): number {
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Normalize slug to be URL-safe.
   * Note: This is a basic normalization. Task 6.2 will implement full slug generation.
   */
  private normalizeSlug(slug: string): string {
    return slug
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  /**
   * Normalize and validate category-specific fields.
   */
  private normalizeFields(
    category: 'people' | 'projects' | 'ideas' | 'task' | 'admin',
    fields: Record<string, unknown>
  ): CategoryFields {
    switch (category) {
      case 'people':
        return this.normalizePeopleFields(fields);
      case 'projects':
        return this.normalizeProjectsFields(fields);
      case 'ideas':
        return this.normalizeIdeasFields(fields);
      case 'task':
      case 'admin':
        return this.normalizeAdminFields(fields);
    }
  }

  /**
   * Normalize people category fields.
   */
  private normalizePeopleFields(fields: Record<string, unknown>): PeopleFields {
    return {
      context: String(fields.context || ''),
      followUps: this.normalizeStringArray(fields.followUps || fields.follow_ups),
      relatedProjects: this.normalizeStringArray(
        fields.relatedProjects || fields.related_projects
      ),
    };
  }

  /**
   * Normalize projects category fields.
   */
  private normalizeProjectsFields(fields: Record<string, unknown>): ProjectsFields {
    const status = fields.status as string;
    const validStatuses = ['active', 'waiting', 'blocked', 'someday'];
    
    return {
      status: validStatuses.includes(status)
        ? (status as ProjectsFields['status'])
        : 'active',
      nextAction: String(fields.nextAction || fields.next_action || ''),
      relatedPeople: this.normalizeStringArray(
        fields.relatedPeople || fields.related_people
      ),
      dueDate: fields.dueDate || fields.due_date
        ? String(fields.dueDate || fields.due_date)
        : undefined,
    };
  }

  /**
   * Normalize ideas category fields.
   */
  private normalizeIdeasFields(fields: Record<string, unknown>): IdeasFields {
    return {
      oneLiner: String(fields.oneLiner || fields.one_liner || ''),
      relatedProjects: this.normalizeStringArray(
        fields.relatedProjects || fields.related_projects
      ),
    };
  }

  /**
   * Normalize admin category fields.
   */
  private normalizeAdminFields(fields: Record<string, unknown>): AdminFields {
    const rawDuration = fields.durationMinutes ?? fields.duration_minutes;
    const parsedDuration = typeof rawDuration === 'number'
      ? rawDuration
      : (typeof rawDuration === 'string' && rawDuration.trim() !== '' ? Number(rawDuration) : NaN);
    const durationMinutes =
      Number.isFinite(parsedDuration) && parsedDuration >= 5
        ? Math.floor(parsedDuration)
        : undefined;
    const rawPriority = fields.priority;
    const parsedPriority = typeof rawPriority === 'number'
      ? rawPriority
      : (typeof rawPriority === 'string' && rawPriority.trim() !== '' ? Number(rawPriority) : NaN);
    const priority =
      Number.isFinite(parsedPriority) && parsedPriority >= 1 && parsedPriority <= 5
        ? Math.floor(parsedPriority)
        : undefined;

    return {
      status: 'pending',
      dueDate: fields.dueDate || fields.due_date
        ? String(fields.dueDate || fields.due_date)
        : undefined,
      dueAt: fields.dueAt || fields.due_at
        ? String(fields.dueAt || fields.due_at)
        : undefined,
      durationMinutes,
      fixedAt: fields.fixedAt || fields.fixed_at
        ? String(fields.fixedAt || fields.fixed_at)
        : undefined,
      priority,
      relatedPeople: this.normalizeStringArray(
        fields.relatedPeople || fields.related_people
      ),
    };
  }

  /**
   * Normalize a value to a string array.
   */
  private normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter((item) => typeof item === 'string').map(String);
    }
    return [];
  }

  /**
   * Normalize related entries array.
   */
  private normalizeRelatedEntries(value: unknown): string[] {
    return this.normalizeStringArray(value);
  }

  /**
   * Normalize body content to a string.
   * Ensures the body content is a valid string, trimmed of excess whitespace.
   * Returns empty string if body_content is not provided or is not a string.
   */
  private normalizeBodyContent(value: unknown): string {
    if (typeof value === 'string') {
      return value.trim();
    }
    return '';
  }
}

// ============================================
// Singleton Instance
// ============================================

let classificationAgentInstance: ClassificationAgent | null = null;

/**
 * Get the ClassificationAgent singleton instance
 */
export function getClassificationAgent(): ClassificationAgent {
  if (!classificationAgentInstance) {
    classificationAgentInstance = new ClassificationAgent();
  }
  return classificationAgentInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetClassificationAgent(): void {
  classificationAgentInstance = null;
}

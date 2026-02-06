/**
 * Action Extraction Service
 * Uses the LLM to extract concrete next actions from free-form text.
 */

import OpenAI from 'openai';
import { getConfig } from '../config/env';
import { Category } from '../types/entry.types';
import { getCurrentDateString } from '../utils/date';

export interface ActionItem {
  text: string;
  type: 'project' | 'admin';
  dueDate?: string;
  confidence: number;
}

export interface ActionExtractionResult {
  primaryAction?: string;
  actions: ActionItem[];
}

export class ActionExtractionError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'ActionExtractionError';
  }
}

const DEFAULT_TIMEOUT_MS = 12000;

const ACTION_SYSTEM_PROMPT = `You extract concrete, actionable next steps from a user's text.
Return JSON only. If there are no clear actions, return an empty actions array.
Favor short, imperative actions (e.g., "Email Sarah for updated dates").
If the text is a project update, extract 1-3 next actions.
If the text is already a single task, return it as the primary action.

Output format:
{
  "primary_action": "string or null",
  "actions": [
    {
      "text": "action text",
      "type": "project" | "admin",
      "due_date": "YYYY-MM-DD" | null,
      "confidence": 0.0-1.0
    }
  ]
}`;

export class ActionExtractionService {
  private openai: OpenAI;
  private timeoutMs: number;
  private model: string;

  constructor(openaiClient?: OpenAI, timeoutMs?: number) {
    const config = getConfig();
    this.openai = openaiClient ?? new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.model = config.OPENAI_MODEL_ACTION_EXTRACTION || 'gpt-4o-mini';
  }

  async extractActions(
    text: string,
    category?: Category
  ): Promise<ActionExtractionResult> {
    if (!text || text.trim().length === 0) {
      return { actions: [] };
    }

    try {
      const response = await this.callOpenAIWithTimeout(text, category);
      return this.parseResponse(response);
    } catch (error) {
      console.warn('ActionExtractionService: failed to extract actions', error);
      return { actions: [] };
    }
  }

  private async callOpenAIWithTimeout(text: string, category?: Category): Promise<string> {
    const today = getCurrentDateString();
    const systemPrompt = `${ACTION_SYSTEM_PROMPT}\nToday's date is ${today}. Convert relative due dates to YYYY-MM-DD.`;
    const request = this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content: `Category: ${category || 'unknown'}\nText: ${text}`
        }
      ],
      temperature: 0.2
    });

    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new ActionExtractionError('Action extraction timed out'));
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([request, timeoutPromise]);
      const content = result.choices[0]?.message?.content || '';
      return content;
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  private parseResponse(raw: string): ActionExtractionResult {
    try {
      const parsed = JSON.parse(raw);
      const actions = Array.isArray(parsed.actions) ? parsed.actions : [];
      const normalized: ActionItem[] = actions
        .filter((action: any) => typeof action?.text === 'string' && action.text.trim().length > 0)
        .map((action: any) => ({
          text: action.text.trim(),
          type: action.type === 'admin' ? 'admin' : 'project',
          dueDate: action.due_date || undefined,
          confidence: typeof action.confidence === 'number' ? action.confidence : 0.5
        }));

      return {
        primaryAction: typeof parsed.primary_action === 'string' ? parsed.primary_action : undefined,
        actions: normalized
      };
    } catch (error) {
      throw new ActionExtractionError('Invalid action extraction response', error as Error);
    }
  }
}

let actionExtractionServiceInstance: ActionExtractionService | null = null;

export function getActionExtractionService(): ActionExtractionService {
  if (!actionExtractionServiceInstance) {
    actionExtractionServiceInstance = new ActionExtractionService();
  }
  return actionExtractionServiceInstance;
}

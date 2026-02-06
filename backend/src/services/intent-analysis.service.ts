import OpenAI from 'openai';
import { getConfig } from '../config/env';

export interface UpdateIntentInput {
  message: string;
  path?: string;
  currentTitle?: string;
  updates?: Record<string, unknown>;
  hasBodyUpdate?: boolean;
}

export interface UpdateIntentAnalysis {
  title?: string;
  note?: string;
  relatedPeople: string[];
  statusChangeRequested: boolean;
  requestedStatus?: string;
  confidence: number;
}

export class IntentAnalysisError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'IntentAnalysisError';
  }
}

const DEFAULT_TIMEOUT_MS = 8000;

const INTENT_SYSTEM_PROMPT = `You analyze a user request for updating an existing entry.
Return JSON only.
Do not invent actions that the user did not request.

Output schema:
{
  "title": "string or null",
  "note": "string or null",
  "related_people": ["string"],
  "status_change_requested": true | false,
  "requested_status": "pending|done|active|waiting|blocked|someday|needs_review|null",
  "confidence": 0.0-1.0
}

Rules:
- "title" should only be set if user explicitly asks to rename/update/change title/name.
- "note" should only be set if user explicitly asks to add/append/include a note/log/comment.
- "status_change_requested" must be false unless the user explicitly asks to mark/complete/reopen/change status.
- Do not classify entities as people unless they are names or direct contacts.
- Keep note concise and without wrapping quotes.`;

export class IntentAnalysisService {
  private openai: OpenAI;
  private timeoutMs: number;
  private model: string;

  constructor(openaiClient?: OpenAI, timeoutMs?: number) {
    const config = getConfig();
    this.openai = openaiClient ?? new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.model = config.OPENAI_MODEL_INTENT_ANALYSIS || 'gpt-4o-mini';
  }

  async analyzeUpdateIntent(input: UpdateIntentInput): Promise<UpdateIntentAnalysis> {
    if (!input.message || input.message.trim().length === 0) {
      throw new IntentAnalysisError('Cannot analyze empty update message');
    }
    const raw = await this.callOpenAIWithTimeout(input);
    return this.parseResponse(raw);
  }

  private async callOpenAIWithTimeout(input: UpdateIntentInput): Promise<string> {
    const request = this.openai.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: INTENT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `Message: ${input.message}`,
            `Path: ${input.path || 'unknown'}`,
            `Current title: ${input.currentTitle || 'unknown'}`,
            `Tool updates payload: ${JSON.stringify(input.updates || {})}`,
            `Tool body_update already present: ${Boolean(input.hasBodyUpdate)}`
          ].join('\n')
        }
      ],
      temperature: 0.1
    });

    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new IntentAnalysisError('Intent analysis timed out'));
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([request, timeoutPromise]);
      return result.choices[0]?.message?.content || '';
    } catch (error) {
      if (error instanceof IntentAnalysisError) {
        throw error;
      }
      throw new IntentAnalysisError(
        `Intent analysis request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  private parseResponse(raw: string): UpdateIntentAnalysis {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new IntentAnalysisError('Intent analysis returned invalid JSON', error as Error);
    }

    const relatedPeople = Array.isArray(parsed.related_people)
      ? parsed.related_people
          .filter((value: unknown) => typeof value === 'string')
          .map((value: string) => value.trim())
          .filter((value: string) => value.length > 0)
      : [];

    return {
      title: typeof parsed.title === 'string' && parsed.title.trim().length > 0
        ? parsed.title.trim()
        : undefined,
      note: typeof parsed.note === 'string' && parsed.note.trim().length > 0
        ? parsed.note.trim()
        : undefined,
      relatedPeople,
      statusChangeRequested: parsed.status_change_requested === true,
      requestedStatus: typeof parsed.requested_status === 'string' && parsed.requested_status.trim().length > 0
        ? parsed.requested_status.trim()
        : undefined,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5
    };
  }
}

let intentAnalysisServiceInstance: IntentAnalysisService | null = null;

export function getIntentAnalysisService(): IntentAnalysisService {
  if (!intentAnalysisServiceInstance) {
    intentAnalysisServiceInstance = new IntentAnalysisService();
  }
  return intentAnalysisServiceInstance;
}

export function resetIntentAnalysisService(): void {
  intentAnalysisServiceInstance = null;
}

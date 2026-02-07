import OpenAI from 'openai';
import { getConfig } from '../config/env';

export interface ToolGuardrailInput {
  toolName: string;
  args: Record<string, unknown>;
  userMessage: string;
}

export interface ToolGuardrailDecision {
  allowed: boolean;
  reason?: string;
  confidence: number;
}

export class ToolGuardrailError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'ToolGuardrailError';
  }
}

const DEFAULT_TIMEOUT_MS = 8000;

const GUARDRAIL_SYSTEM_PROMPT = `You validate whether a planned tool call matches explicit user intent.
Return JSON only.
Fail safe: if intent is unclear or tool action is stronger than request, block it.

Output schema:
{
  "allowed": true | false,
  "reason": "short string",
  "confidence": 0.0-1.0
}

Rules:
- Block status changes unless user explicitly requested status change.
- Block delete/move/merge unless user explicitly requested them.
- For update_entry, block when tool arguments conflict with requested status.
- If uncertain, set allowed=false.`;

export class ToolGuardrailService {
  private openai: OpenAI;
  private model: string;
  private timeoutMs: number;

  constructor(openaiClient?: OpenAI, timeoutMs?: number) {
    const config = getConfig();
    this.openai = openaiClient ?? new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.model = config.OPENAI_MODEL_TOOL_GUARDRAIL || config.OPENAI_MODEL_INTENT_ANALYSIS || 'gpt-4o-mini';
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async validateToolCall(input: ToolGuardrailInput): Promise<ToolGuardrailDecision> {
    if (!input.userMessage || input.userMessage.trim().length === 0) {
      throw new ToolGuardrailError('Cannot run tool guardrail without a user message');
    }

    const raw = await this.callOpenAIWithTimeout(input);
    return this.parseResponse(raw);
  }

  private async callOpenAIWithTimeout(input: ToolGuardrailInput): Promise<string> {
    const request = this.openai.chat.completions.create({
      model: this.model,
      temperature: 0,
      messages: [
        { role: 'system', content: GUARDRAIL_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `User message: ${input.userMessage}`,
            `Planned tool: ${input.toolName}`,
            `Planned arguments: ${JSON.stringify(input.args)}`
          ].join('\n')
        }
      ]
    });

    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new ToolGuardrailError('Tool guardrail timed out'));
      }, this.timeoutMs);
    });

    try {
      const result = await Promise.race([request, timeoutPromise]);
      return result.choices[0]?.message?.content || '';
    } catch (error) {
      if (error instanceof ToolGuardrailError) {
        throw error;
      }
      throw new ToolGuardrailError(
        `Tool guardrail request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error : undefined
      );
    } finally {
      clearTimeout(timeoutId!);
    }
  }

  private parseResponse(raw: string): ToolGuardrailDecision {
    let parsed: any;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new ToolGuardrailError('Tool guardrail returned invalid JSON', error as Error);
    }

    const allowed = parsed.allowed === true;
    const reason = typeof parsed.reason === 'string' ? parsed.reason.trim() : '';
    const confidence = typeof parsed.confidence === 'number' ? parsed.confidence : 0.5;

    return {
      allowed,
      reason: reason.length > 0 ? reason : undefined,
      confidence
    };
  }
}

let toolGuardrailServiceInstance: ToolGuardrailService | null = null;

export function getToolGuardrailService(): ToolGuardrailService {
  if (!toolGuardrailServiceInstance) {
    toolGuardrailServiceInstance = new ToolGuardrailService();
  }
  return toolGuardrailServiceInstance;
}

export function resetToolGuardrailService(): void {
  toolGuardrailServiceInstance = null;
}


/**
 * Embedding Service
 * Provides text embeddings for semantic search.
 */

import OpenAI from 'openai';
import { getConfig } from '../config/env';

export interface EmbeddingService {
  embed(text: string): Promise<number[]>;
}

export class EmbeddingError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MODEL = 'text-embedding-3-large';

export class OpenAIEmbeddingService implements EmbeddingService {
  private openai: OpenAI;
  private timeoutMs: number;
  private model: string;

  constructor(openaiClient?: OpenAI, timeoutMs?: number, model?: string) {
    const config = getConfig();
    this.openai = openaiClient ?? new OpenAI({ apiKey: config.OPENAI_API_KEY });
    this.timeoutMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.model = model ?? (process.env.EMBEDDING_MODEL || DEFAULT_MODEL);
  }

  async embed(text: string): Promise<number[]> {
    try {
      const response = await this.withTimeout(
        this.openai.embeddings.create({
          model: this.model,
          input: text
        }),
        this.timeoutMs
      );
      if (!response.data?.length) {
        throw new EmbeddingError('Empty embedding response');
      }
      return response.data[0].embedding;
    } catch (error) {
      if (error instanceof EmbeddingError) {
        throw error;
      }
      throw new EmbeddingError('Embedding request failed', error as Error);
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: NodeJS.Timeout;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new EmbeddingError('Embedding request timed out'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId!);
    }
  }
}

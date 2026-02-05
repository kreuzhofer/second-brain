import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { getConfig } from '../config/env';
import { getPrismaClient } from '../lib/prisma';
import { EntryService } from './entry.service';
import { OpenAIEmbeddingService } from './embedding.service';
import { Category } from '../types/entry.types';
import { requireUserId } from '../context/user-context';

interface BackfillConfig {
  enabled: boolean;
  batchSize: number;
  limit: number;
  sleepMs: number;
  maxChars: number;
  category?: Category;
}

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_CHARS = 4000;

function parseCategory(value?: string): Category | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  if (normalized === 'people') return 'people';
  if (normalized === 'projects') return 'projects';
  if (normalized === 'ideas') return 'ideas';
  if (normalized === 'admin') return 'admin';
  if (normalized === 'inbox') return 'inbox';
  return undefined;
}

function buildEmbeddingText(
  name: string,
  entry: Record<string, unknown>,
  content: string,
  category: Category
): string {
  const parts: string[] = [];
  if (name) parts.push(name);

  if (category === 'ideas' && typeof entry.one_liner === 'string') {
    parts.push(entry.one_liner);
  }

  if (category === 'people' && typeof entry.context === 'string') {
    parts.push(entry.context);
  }

  if (category === 'projects' && typeof entry.next_action === 'string') {
    parts.push(entry.next_action);
  }

  if (category === 'inbox' && typeof entry.original_text === 'string') {
    parts.push(entry.original_text);
  }

  if (content) parts.push(content);

  return parts.join('\n');
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export class EmbeddingBackfillService {
  private prisma = getPrismaClient();
  private entryService = new EntryService();
  private embeddingService?: OpenAIEmbeddingService;
  private config: BackfillConfig;
  private running = false;

  constructor() {
    const maxChars = parseInt(process.env.EMBEDDING_MAX_CHARS || String(DEFAULT_MAX_CHARS), 10);
    const batchSize = parseInt(process.env.EMBEDDING_BACKFILL_BATCH_SIZE || String(DEFAULT_BATCH_SIZE), 10);
    const limit = parseInt(process.env.EMBEDDING_BACKFILL_LIMIT || '0', 10);
    const sleepMs = parseInt(process.env.EMBEDDING_BACKFILL_SLEEP_MS || '0', 10);
    const enabled = process.env.EMBEDDING_BACKFILL_ENABLED !== 'false';

    this.config = {
      enabled,
      batchSize: Number.isFinite(batchSize) && batchSize > 0 ? batchSize : DEFAULT_BATCH_SIZE,
      limit: Number.isFinite(limit) && limit > 0 ? limit : 0,
      sleepMs: Number.isFinite(sleepMs) && sleepMs > 0 ? sleepMs : 0,
      maxChars: Number.isFinite(maxChars) && maxChars > 0 ? maxChars : DEFAULT_MAX_CHARS,
      category: parseCategory(process.env.EMBEDDING_BACKFILL_CATEGORY)
    };
  }

  start(): void {
    if (process.env.NODE_ENV === 'test') return;
    void this.runIfNeeded();
  }

  async runIfNeeded(): Promise<void> {
    if (this.running) return;
    if (!this.config.enabled) {
      console.log('Embedding backfill: disabled');
      return;
    }

    const env = getConfig();
    if (!env.OPENAI_API_KEY) {
      console.warn('Embedding backfill: skipped (OPENAI_API_KEY missing)');
      return;
    }

    const userId = requireUserId();
    const where = this.config.category ? { category: this.config.category } : {};
    const missingCount = await this.prisma.entry.count({
      where: { ...where, embedding: null, userId }
    });

    if (missingCount === 0) {
      console.log('Embedding backfill: no missing embeddings');
      return;
    }

    this.embeddingService = new OpenAIEmbeddingService();
    this.running = true;

    try {
      await this.runBackfill(missingCount);
    } catch (error) {
      console.error('Embedding backfill failed:', error);
    } finally {
      this.running = false;
    }
  }

  private async runBackfill(missingCount: number): Promise<void> {
    let processed = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;

    console.log(`Embedding backfill: starting (missing=${missingCount})`);

    while (true) {
      if (this.config.limit > 0 && processed >= this.config.limit) {
        break;
      }

      const batch = await this.prisma.entry.findMany({
        where: {
          embedding: null,
          userId: requireUserId(),
          ...(this.config.category ? { category: this.config.category } : {})
        },
        orderBy: { createdAt: 'asc' },
        take: this.config.batchSize
      });

      if (batch.length === 0) {
        break;
      }

      for (const entry of batch) {
        if (this.config.limit > 0 && processed >= this.config.limit) {
          break;
        }
        processed += 1;

        try {
          const full = await this.entryService.read(`${entry.category}/${entry.slug}.md`);
          const entryName = (full.entry as any).name
            ?? (full.entry as any).suggested_name
            ?? entry.title;
          const embeddingText = buildEmbeddingText(
            entryName,
            full.entry as unknown as Record<string, unknown>,
            full.content || '',
            entry.category as Category
          );

          const trimmed = embeddingText.slice(0, this.config.maxChars).trim();
          if (!trimmed) {
            skipped += 1;
            continue;
          }

          const hash = createHash('sha256').update(trimmed).digest('hex');
          const vector = await this.embeddingService!.embed(trimmed);
          const embeddingLiteral = `[${vector.join(',')}]`;

          await this.prisma.$executeRaw(Prisma.sql`
            INSERT INTO "EntryEmbedding" ("entryId", "vector", "hash", "updatedAt")
            VALUES (${entry.id}, ${embeddingLiteral}::vector, ${hash}, NOW())
            ON CONFLICT ("entryId") DO UPDATE
            SET "vector" = ${embeddingLiteral}::vector,
                "hash" = ${hash},
                "updatedAt" = NOW()
          `);

          updated += 1;
        } catch (error) {
          errors += 1;
          console.error(`Embedding backfill failed for ${entry.category}/${entry.slug}.md:`, error);
        }

        if (this.config.sleepMs > 0) {
          await sleep(this.config.sleepMs);
        }
      }
    }

    console.log(
      `Embedding backfill: complete (processed=${processed}, updated=${updated}, skipped=${skipped}, errors=${errors})`
    );
  }
}

let embeddingBackfillInstance: EmbeddingBackfillService | null = null;

export function getEmbeddingBackfillService(): EmbeddingBackfillService {
  if (!embeddingBackfillInstance) {
    embeddingBackfillInstance = new EmbeddingBackfillService();
  }
  return embeddingBackfillInstance;
}

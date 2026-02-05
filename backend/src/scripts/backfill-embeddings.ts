import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { getConfig } from '../config/env';
import { getPrismaClient } from '../lib/prisma';
import { EntryService } from '../services/entry.service';
import { OpenAIEmbeddingService } from '../services/embedding.service';
import { Category } from '../types/entry.types';

const DEFAULT_MAX_CHARS = 4000;

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

async function main(): Promise<void> {
  const config = getConfig();
  if (!config.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required to backfill embeddings.');
    process.exit(1);
  }

  const prisma = getPrismaClient();
  const entryService = new EntryService();
  const embeddingService = new OpenAIEmbeddingService();

  const category = (process.env.BACKFILL_CATEGORY as Category | undefined) || undefined;
  const limit = parseInt(process.env.BACKFILL_LIMIT || '0', 10);
  const maxChars = parseInt(process.env.EMBEDDING_MAX_CHARS || String(DEFAULT_MAX_CHARS), 10);
  const dryRun = process.env.BACKFILL_DRY_RUN === 'true';
  const sleepMs = parseInt(process.env.BACKFILL_SLEEP_MS || '0', 10);

  const summaries = await entryService.list(category);

  let processed = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (const summary of summaries) {
    if (limit > 0 && processed >= limit) break;
    processed += 1;

    try {
      const full = await entryService.read(summary.path);
      const embeddingText = buildEmbeddingText(
        summary.name,
        full.entry as unknown as Record<string, unknown>,
        full.content || '',
        summary.category
      );

      const trimmed = embeddingText.slice(0, maxChars).trim();
      if (!trimmed) {
        skipped += 1;
        continue;
      }

      const hash = createHash('sha256').update(trimmed).digest('hex');
      const existing = await prisma.entryEmbedding.findUnique({
        where: { entryId: summary.id },
        select: { hash: true }
      });

      if (existing?.hash === hash) {
        skipped += 1;
        continue;
      }

      const vector = await embeddingService.embed(trimmed);
      const embeddingLiteral = `[${vector.join(',')}]`;

      if (!dryRun) {
        await prisma.$executeRaw(Prisma.sql`
          INSERT INTO "EntryEmbedding" ("entryId", "vector", "hash", "updatedAt")
          VALUES (${summary.id}, ${embeddingLiteral}::vector, ${hash}, NOW())
          ON CONFLICT ("entryId") DO UPDATE
          SET "vector" = ${embeddingLiteral}::vector,
              "hash" = ${hash},
              "updatedAt" = NOW()
        `);
      }

      updated += 1;
    } catch (error) {
      errors += 1;
      console.error(`Failed to backfill embedding for ${summary.path}:`, error);
    }

    if (sleepMs > 0) {
      await sleep(sleepMs);
    }
  }

  console.log(`Processed: ${processed}`);
  console.log(`Updated: ${updated}`);
  console.log(`Skipped: ${skipped}`);
  console.log(`Errors: ${errors}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Backfill embeddings failed:', error);
    process.exit(1);
  });

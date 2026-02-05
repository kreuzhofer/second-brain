import { readFile, readdir } from 'fs/promises';
import { join, resolve, basename } from 'path';
import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { getConfig } from '../config/env';
import { getPrismaClient } from '../lib/prisma';
import { parseContentForStorage } from './entry-content';

type Category = 'people' | 'projects' | 'ideas' | 'admin' | 'inbox';

export const MEMORY_CATEGORIES: Category[] = ['people', 'projects', 'ideas', 'admin', 'inbox'];
const EMBEDDING_DIM = 3072;

function parseDate(value?: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseArray(value?: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === 'string') return [value];
  return [];
}

function isUuid(value?: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function getMemoryPath(): string {
  const config = getConfig();
  if (config.DATA_PATH) {
    return resolve(config.DATA_PATH);
  }
  return resolve(process.cwd(), '..', 'memory');
}

export async function listMarkdownFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(dir, entry.name));
}

export async function hasAnyMemoryFiles(memoryPath: string): Promise<boolean> {
  for (const category of MEMORY_CATEGORIES) {
    const dir = join(memoryPath, category);
    try {
      const files = await listMarkdownFiles(dir);
      if (files.length > 0) return true;
    } catch {
      continue;
    }
  }
  return false;
}

export async function importEntry(
  prisma: ReturnType<typeof getPrismaClient>,
  category: Category,
  filePath: string
): Promise<{ imported: boolean; skipped: boolean }> {
  const slug = basename(filePath, '.md');
  const raw = await readFile(filePath, 'utf-8');
  const parsed = matter(raw);
  const data = parsed.data as Record<string, unknown>;
  const content = parsed.content || '';

  const createdAt = parseDate(String(data.created_at || '')) || new Date();
  const updatedAt = parseDate(String(data.updated_at || '')) || createdAt;

  const entryId = isUuid(data.id) ? data.id : uuidv4();
  const sourceChannel = (data.source_channel as string | undefined) || 'api';
  const confidence = typeof data.confidence === 'number' ? data.confidence : undefined;
  const tags = parseArray(data.tags);

  let title = String(data.name || slug);
  if (category === 'inbox') {
    title = String(data.suggested_name || data.name || slug);
  }

  const existing = await prisma.entry.findUnique({
    where: { category_slug: { category, slug } }
  });

  if (existing) {
    return { imported: false, skipped: true };
  }

  await prisma.$transaction(async (tx) => {
    await tx.entry.create({
      data: {
        id: entryId,
        category,
        slug,
        title,
        confidence,
        sourceChannel: sourceChannel as any,
        createdAt,
        updatedAt,
        lastTouched: category === 'people'
          ? (parseDate(String(data.last_touched || '')) || updatedAt)
          : null,
        focusMinutesTotal: typeof data.focus_minutes_total === 'number'
          ? data.focus_minutes_total
          : 0,
        focusLastSession: parseDate(String(data.focus_last_session || '')) || null
      }
    });

    if (category === 'people') {
      await tx.personDetails.create({
        data: {
          entryId,
          context: String(data.context || ''),
          followUps: parseArray(data.follow_ups),
          relatedProjects: parseArray(data.related_projects),
          lastTouched: parseDate(String(data.last_touched || '')) || updatedAt
        }
      });
    }

    if (category === 'projects') {
      await tx.projectDetails.create({
        data: {
          entryId,
          status: (data.status as any) || 'active',
          nextAction: String(data.next_action || ''),
          relatedPeople: parseArray(data.related_people),
          dueDate: parseDate(String(data.due_date || '')) || null,
          stale: Boolean(data.stale),
          staleSince: parseDate(String(data.stale_since || '')) || null
        }
      });
    }

    if (category === 'ideas') {
      await tx.ideaDetails.create({
        data: {
          entryId,
          oneLiner: String(data.one_liner || ''),
          relatedProjects: parseArray(data.related_projects)
        }
      });
    }

    if (category === 'admin') {
      await tx.adminTaskDetails.create({
        data: {
          entryId,
          status: (data.status as any) || 'pending',
          dueDate: parseDate(String(data.due_date || '')) || null
        }
      });
    }

    if (category === 'inbox') {
      await tx.inboxDetails.create({
        data: {
          entryId,
          originalText: String(data.original_text || ''),
          suggestedCategory: (data.suggested_category as any) || 'inbox',
          suggestedName: String(data.suggested_name || data.name || ''),
          status: (data.status as any) || 'needs_review'
        }
      });
    }

    if (tags.length > 0) {
      const existingTags = await tx.tag.findMany({ where: { name: { in: tags } } });
      const existingNames = new Set(existingTags.map((tag) => tag.name));
      const toCreate = tags.filter((tag) => !existingNames.has(tag));
      if (toCreate.length > 0) {
        await tx.tag.createMany({ data: toCreate.map((name) => ({ name })) });
      }
      const allTags = await tx.tag.findMany({ where: { name: { in: tags } } });
      await tx.entryTag.createMany({
        data: allTags.map((tag) => ({ entryId, tagId: tag.id }))
      });
    }

    const parsedContent = parseContentForStorage(content);
    if (parsedContent.sections.length > 0) {
      await tx.entrySection.createMany({
        data: parsedContent.sections.map((section, index) => ({
          entryId,
          key: section.key,
          title: section.title,
          order: index,
          contentMarkdown: section.contentMarkdown
        }))
      });
    }

    if (parsedContent.logs.length > 0) {
      await tx.entryLog.createMany({
        data: parsedContent.logs.map((log) => ({
          entryId,
          channel: sourceChannel as any,
          message: log.message,
          createdAt: log.createdAt || updatedAt
        }))
      });
    }

    const entrySnapshot = await tx.entry.findUnique({
      where: { id: entryId },
      include: {
        projectDetails: true,
        adminDetails: true,
        ideaDetails: true,
        personDetails: true,
        inboxDetails: true,
        sections: { orderBy: { order: 'asc' } },
        logs: { orderBy: { createdAt: 'asc' } },
        tags: { include: { tag: true } }
      }
    });

    if (entrySnapshot) {
      await tx.entryRevision.create({
        data: {
          entryId,
          revision: 1,
          channel: sourceChannel as any,
          createdAt: updatedAt,
          snapshot: {
            entry: {
              category: entrySnapshot.category,
              slug: entrySnapshot.slug,
              title: entrySnapshot.title,
              confidence: entrySnapshot.confidence,
              sourceChannel: entrySnapshot.sourceChannel,
              createdAt: entrySnapshot.createdAt,
              updatedAt: entrySnapshot.updatedAt,
              lastTouched: entrySnapshot.lastTouched,
              focusMinutesTotal: entrySnapshot.focusMinutesTotal,
              focusLastSession: entrySnapshot.focusLastSession
            },
            details: {
              project: entrySnapshot.projectDetails,
              admin: entrySnapshot.adminDetails,
              idea: entrySnapshot.ideaDetails,
              person: entrySnapshot.personDetails,
              inbox: entrySnapshot.inboxDetails
            },
            sections: entrySnapshot.sections,
            logs: entrySnapshot.logs,
            tags: entrySnapshot.tags.map((tag) => tag.tag.name)
          }
        }
      });
    }
  });

  return { imported: true, skipped: false };
}

export async function importMemoryEntries(
  prisma: ReturnType<typeof getPrismaClient>,
  memoryPath: string
): Promise<{ imported: number; skipped: number }> {
  let imported = 0;
  let skipped = 0;

  for (const category of MEMORY_CATEGORIES) {
    const dir = join(memoryPath, category);
    let files: string[] = [];
    try {
      files = await listMarkdownFiles(dir);
    } catch {
      continue;
    }

    for (const file of files) {
      const result = await importEntry(prisma, category, file);
      if (result.imported) imported += 1;
      if (result.skipped) skipped += 1;
    }
  }

  return { imported, skipped };
}

export async function importEmbeddingsFromCache(
  prisma: ReturnType<typeof getPrismaClient>,
  memoryPath: string
): Promise<{ imported: number; skipped: number }> {
  const cachePath = join(memoryPath, '.cache', 'embeddings.json');
  try {
    const raw = await readFile(cachePath, 'utf-8');
    const parsed = JSON.parse(raw) as {
      entries?: Record<string, { vector: number[]; hash: string }>;
    };
    if (!parsed.entries) return { imported: 0, skipped: 0 };

    let imported = 0;
    let skipped = 0;

    for (const [path, payload] of Object.entries(parsed.entries)) {
      if (!payload?.vector || payload.vector.length !== EMBEDDING_DIM) {
        skipped += 1;
        continue;
      }
      const [category, file] = path.split('/');
      const slug = file?.replace(/\.md$/, '');
      if (!category || !slug) {
        skipped += 1;
        continue;
      }
      const entry = await prisma.entry.findUnique({
        where: { category_slug: { category: category as Category, slug } }
      });
      if (!entry) {
        skipped += 1;
        continue;
      }

      const vectorLiteral = `[${payload.vector.join(',')}]`;
      const hash = payload.hash || createHash('sha256').update(JSON.stringify(payload.vector)).digest('hex');

      await prisma.$executeRawUnsafe(
        `INSERT INTO "EntryEmbedding" ("entryId", "vector", "hash", "updatedAt")\n` +
          `VALUES ($1, $2::vector, $3, NOW())\n` +
          `ON CONFLICT ("entryId") DO UPDATE\n` +
          `SET "vector" = $2::vector,\n` +
          `    "hash" = $3,\n` +
          `    "updatedAt" = NOW()`,
        entry.id,
        vectorLiteral,
        hash
      );

      imported += 1;
    }

    return { imported, skipped };
  } catch {
    return { imported: 0, skipped: 0 };
  }
}

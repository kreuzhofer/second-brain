import { getPrismaClient } from '../lib/prisma';
import { Category, Channel, EntryWithPath } from '../types/entry.types';
import { EntryNotFoundError, EntryService, generateSlug } from './entry.service';
import { requireUserId } from '../context/user-context';

export interface EntryLinkSummary {
  path: string;
  category: Category;
  name: string;
}

export interface EntryLinksResponse {
  outgoing: EntryLinkSummary[];
  incoming: EntryLinkSummary[];
}

function buildEntryPath(category: Category, slug: string): string {
  return `${category}/${slug}`;
}

function parseEntryPath(path: string): { category: Category; slug: string } {
  const [rawCategory, rawSlug] = path.split('/');
  if (!rawCategory || !rawSlug) {
    throw new EntryNotFoundError(path);
  }
  const category = rawCategory as Category;
  if (!['people', 'projects', 'ideas', 'admin', 'inbox'].includes(category)) {
    throw new EntryNotFoundError(path);
  }
  const slug = rawSlug.endsWith('.md') ? rawSlug.slice(0, -3) : rawSlug;
  return { category, slug };
}

function normalizePeopleNames(names: string[]): string[] {
  const trimmed = names
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(trimmed));
}

export class EntryLinkService {
  private prisma = getPrismaClient();
  private entryService: EntryService;

  constructor(entryService?: EntryService) {
    this.entryService = entryService ?? new EntryService();
  }

  async linkPeopleForEntry(
    entry: EntryWithPath,
    peopleNames: string[],
    channel: Channel = 'api'
  ): Promise<void> {
    const userId = requireUserId();
    const uniqueNames = normalizePeopleNames(peopleNames);
    if (uniqueNames.length === 0) return;

    const sourceEntryId = (entry.entry as { id?: string }).id;
    if (!sourceEntryId) return;

    const targetEntryIds: string[] = [];

    for (const name of uniqueNames) {
      const slug = generateSlug(name);
      const existing = await this.prisma.entry.findUnique({
        where: {
          userId_category_slug: {
            userId,
            category: 'people',
            slug
          }
        }
      });

      if (existing) {
        targetEntryIds.push(existing.id);
        continue;
      }

      const created = await this.entryService.create(
        'people',
        {
          name,
          context: `Mentioned in task: ${(entry.entry as any).name || entry.path}`,
          follow_ups: [],
          related_projects: [],
          source_channel: channel,
          confidence: (entry.entry as any).confidence ?? 0.5
        },
        channel
      );

      const createdId = (created.entry as { id?: string }).id;
      if (createdId) {
        targetEntryIds.push(createdId);
      }
    }

    if (targetEntryIds.length === 0) return;

    await this.prisma.entryLink.createMany({
      data: targetEntryIds.map((targetEntryId) => ({
        userId,
        sourceEntryId,
        targetEntryId,
        type: 'mention'
      })),
      skipDuplicates: true
    });
  }

  async getLinksForPath(path: string): Promise<EntryLinksResponse> {
    const userId = requireUserId();
    const { category, slug } = parseEntryPath(path);

    const entry = await this.prisma.entry.findUnique({
      where: { userId_category_slug: { userId, category, slug } }
    });

    if (!entry) {
      throw new EntryNotFoundError(path);
    }

    const [outgoingLinks, incomingLinks] = await Promise.all([
      this.prisma.entryLink.findMany({
        where: { userId, sourceEntryId: entry.id },
        include: { targetEntry: true }
      }),
      this.prisma.entryLink.findMany({
        where: { userId, targetEntryId: entry.id },
        include: { sourceEntry: true }
      })
    ]);

    const outgoing = outgoingLinks.map((link) => ({
      path: buildEntryPath(link.targetEntry.category as Category, link.targetEntry.slug),
      category: link.targetEntry.category as Category,
      name: link.targetEntry.title
    }));

    const incoming = incomingLinks.map((link) => ({
      path: buildEntryPath(link.sourceEntry.category as Category, link.sourceEntry.slug),
      category: link.sourceEntry.category as Category,
      name: link.sourceEntry.title
    }));

    return { outgoing, incoming };
  }
}

let entryLinkServiceInstance: EntryLinkService | null = null;

export function getEntryLinkService(): EntryLinkService {
  if (!entryLinkServiceInstance) {
    entryLinkServiceInstance = new EntryLinkService();
  }
  return entryLinkServiceInstance;
}

export function resetEntryLinkService(): void {
  entryLinkServiceInstance = null;
}

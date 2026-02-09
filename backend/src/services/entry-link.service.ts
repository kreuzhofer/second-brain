import { getPrismaClient } from '../lib/prisma';
import {
  Category,
  Channel,
  EntryWithPath,
  EntryGraphConnection,
  EntryGraphEdge,
  EntryGraphResponse,
  EntryLinkSummary
} from '../types/entry.types';
import { EntryNotFoundError, EntryService, InvalidEntryDataError, generateSlug } from './entry.service';
import { requireUserId } from '../context/user-context';
import {
  isValidCategory,
  toCanonicalCategory,
  toLegacyCompatibleCategories
} from '../utils/category';

export interface EntryLinksResponse {
  outgoing: EntryLinkSummary[];
  incoming: EntryLinkSummary[];
}

function buildEntryPath(category: Category, slug: string): string {
  return `${toCanonicalCategory(category)}/${slug}`;
}

function toEntrySummary(category: string, slug: string, title: string): EntryLinkSummary {
  return {
    path: buildEntryPath(category as Category, slug),
    category: toCanonicalCategory(category),
    name: title
  };
}

function parseEntryPath(path: string): { category: Category; slug: string } {
  const [rawCategory, rawSlug] = path.split('/');
  if (!rawCategory || !rawSlug) {
    throw new EntryNotFoundError(path);
  }
  if (!isValidCategory(rawCategory)) {
    throw new EntryNotFoundError(path);
  }
  const category = toCanonicalCategory(rawCategory);
  const slug = rawSlug.endsWith('.md') ? rawSlug.slice(0, -3) : rawSlug;
  return { category, slug };
}

function normalizePeopleNames(names: string[]): string[] {
  const trimmed = names
    .map((name) => (typeof name === 'string' ? name.trim() : ''))
    .filter(Boolean);
  return Array.from(new Set(trimmed));
}

const PERSON_STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'about',
  'regarding',
  're',
  'with',
  'task',
  'project',
  'item',
  'note',
  'my',
  'his',
  'her',
  'their',
  'your',
  'our',
  'apology',
  'apologies',
  'sorry',
  'delay',
  'delays',
  'for'
]);

const PROJECT_STOPWORDS = new Set([
  'project',
  'projects',
  'task',
  'tasks',
  'idea',
  'ideas',
  'admin',
  'inbox',
  'entry',
  'note',
  'notes'
]);

interface ProjectLinkOptions {
  createMissing?: boolean;
}

type RelationshipKind = 'relationship';
export type EntryLinkDirection = 'outgoing' | 'incoming';
export type EntryLinkKind = 'mention' | 'relationship';

function uniqueNormalized(values: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function toTitleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => {
      if (word.length <= 3 && word.toUpperCase() === word) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

function sanitizePersonCandidate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const pathMatch = trimmed.match(/^people\/([a-z0-9-]+)(?:\.md)?$/i);
  if (pathMatch?.[1]) {
    const words = pathMatch[1]
      .split('-')
      .map((word) => word.trim())
      .filter(Boolean);
    if (words.length === 0 || words.length > 3) return null;
    const candidate = toTitleCase(words.join(' '));
    return candidate.length > 1 ? candidate : null;
  }

  const words = trimmed
    .replace(/['"`.,:;!?()[\]{}]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);

  if (words.length === 0 || words.length > 3) return null;
  if (words.some((word) => PERSON_STOPWORDS.has(word.toLowerCase()))) return null;

  const hasCapitalized = words.some((word) => /^(?:[A-Z][a-z].*|[A-Z]{2,})$/.test(word));
  if (!hasCapitalized) return null;

  const normalized = words.map((word) => {
    if (word.length <= 3 && word.toUpperCase() === word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  }).join(' ');

  return normalized.length > 1 ? normalized : null;
}

function sanitizeProjectCandidate(raw: string): string | null {
  const trimmed = raw.trim().replace(/^["“]|["”]$/g, '');
  if (!trimmed) return null;

  const pathMatch = trimmed.match(/^projects\/([a-z0-9-]+)(?:\.md)?$/i);
  if (pathMatch?.[1]) {
    return toTitleCase(pathMatch[1].replace(/-/g, ' '));
  }

  const words = trimmed
    .replace(/['"`.,:;!?()[\]{}]/g, ' ')
    .split(/\s+/)
    .map((word) => word.trim())
    .filter(Boolean);
  if (words.length === 0) return null;

  if (words.length === 1 && PROJECT_STOPWORDS.has(words[0].toLowerCase())) {
    return null;
  }
  if (words.every((word) => PROJECT_STOPWORDS.has(word.toLowerCase()))) {
    return null;
  }

  const normalized = toTitleCase(words.join(' '));
  if (normalized.length < 3 || normalized.length > 120) return null;
  return normalized;
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
    const uniqueNames = uniqueNormalized(
      normalizePeopleNames(peopleNames)
        .map((name) => sanitizePersonCandidate(name))
        .filter((name): name is string => Boolean(name))
    );
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

  async capturePeopleRelationship(
    peopleNames: string[],
    relation: RelationshipKind,
    sourceText: string,
    channel: Channel = 'api'
  ): Promise<EntryWithPath> {
    const userId = requireUserId();
    const uniqueNames = uniqueNormalized(
      normalizePeopleNames(peopleNames)
        .map((name) => sanitizePersonCandidate(name))
        .filter((name): name is string => Boolean(name))
    );
    if (uniqueNames.length < 2) {
      throw new Error('At least two valid people names are required to capture a relationship.');
    }

    const personEntries: EntryWithPath[] = [];
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
        personEntries.push(await this.entryService.read(buildEntryPath('people', slug)));
        continue;
      }

      const created = await this.entryService.create(
        'people',
        {
          name,
          context: sourceText.trim(),
          follow_ups: [],
          related_projects: [],
          source_channel: channel,
          confidence: 0.95
        },
        channel
      );
      personEntries.push(created);
    }

    if (personEntries.length < 2) {
      throw new Error('Failed to resolve people entries for relationship capture.');
    }

    const relationshipLinkRows: Array<{
      userId: string;
      sourceEntryId: string;
      targetEntryId: string;
      type: RelationshipKind;
    }> = [];

    for (let i = 0; i < personEntries.length; i += 1) {
      const sourceEntryId = (personEntries[i].entry as { id?: string }).id;
      if (!sourceEntryId) continue;
      for (let j = i + 1; j < personEntries.length; j += 1) {
        const targetEntryId = (personEntries[j].entry as { id?: string }).id;
        if (!targetEntryId) continue;
        relationshipLinkRows.push({
          userId,
          sourceEntryId,
          targetEntryId,
          type: relation
        });
        relationshipLinkRows.push({
          userId,
          sourceEntryId: targetEntryId,
          targetEntryId: sourceEntryId,
          type: relation
        });
      }
    }

    if (relationshipLinkRows.length > 0) {
      await this.prisma.entryLink.createMany({
        data: relationshipLinkRows,
        skipDuplicates: true
      });
    }

    return personEntries[0];
  }

  async linkProjectsForEntry(
    entry: EntryWithPath,
    projectNamesOrSlugs: string[],
    channel: Channel = 'api',
    options?: ProjectLinkOptions
  ): Promise<void> {
    const userId = requireUserId();
    const unique = uniqueNormalized(
      normalizePeopleNames(projectNamesOrSlugs)
        .map((name) => sanitizeProjectCandidate(name))
        .filter((name): name is string => Boolean(name))
    );
    if (unique.length === 0) return;

    const sourceEntryId = (entry.entry as { id?: string }).id;
    if (!sourceEntryId) return;

    const targetEntryIds: string[] = [];
    for (const ref of unique) {
      const slug = generateSlug(ref);
      const existing = await this.prisma.entry.findUnique({
        where: {
          userId_category_slug: {
            userId,
            category: 'projects',
            slug
          }
        }
      });
      if (existing) {
        targetEntryIds.push(existing.id);
        continue;
      }

      if (options?.createMissing) {
        const created = await this.entryService.create(
          'projects',
          {
            name: ref,
            status: 'someday',
            next_action: '',
            related_people: [],
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

  async addManualLink(
    sourcePath: string,
    targetPath: string,
    type: EntryLinkKind = 'mention'
  ): Promise<void> {
    const userId = requireUserId();
    const sourceEntry = await this.resolveEntryByPath(sourcePath, userId);
    const targetEntry = await this.resolveEntryByPath(targetPath, userId);

    if (sourceEntry.id === targetEntry.id) {
      throw new InvalidEntryDataError('Cannot link an entry to itself');
    }

    await this.prisma.entryLink.createMany({
      data: [
        {
          userId,
          sourceEntryId: sourceEntry.id,
          targetEntryId: targetEntry.id,
          type
        }
      ],
      skipDuplicates: true
    });
  }

  async removeManualLink(
    entryPath: string,
    targetPath: string,
    direction: EntryLinkDirection = 'outgoing',
    type?: EntryLinkKind
  ): Promise<number> {
    const userId = requireUserId();
    const entry = await this.resolveEntryByPath(entryPath, userId);
    const target = await this.resolveEntryByPath(targetPath, userId);

    const where =
      direction === 'outgoing'
        ? {
            userId,
            sourceEntryId: entry.id,
            targetEntryId: target.id,
            ...(type ? { type } : {})
          }
        : {
            userId,
            sourceEntryId: target.id,
            targetEntryId: entry.id,
            ...(type ? { type } : {})
          };

    const deleted = await this.prisma.entryLink.deleteMany({ where });
    return deleted.count;
  }

  async getLinksForPath(path: string): Promise<EntryLinksResponse> {
    const userId = requireUserId();
    const entry = await this.resolveEntryByPath(path, userId);

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

    const outgoing = outgoingLinks.map((link) =>
      toEntrySummary(link.targetEntry.category, link.targetEntry.slug, link.targetEntry.title)
    );

    const incoming = incomingLinks.map((link) =>
      toEntrySummary(link.sourceEntry.category, link.sourceEntry.slug, link.sourceEntry.title)
    );

    return { outgoing, incoming };
  }

  async getGraphForPath(path: string): Promise<EntryGraphResponse> {
    const userId = requireUserId();
    const entry = await this.resolveEntryByPath(path, userId);
    return this.getGraphForEntry(entry, userId);
  }

  private async getGraphForEntry(
    entry: { id: string; category: string; slug: string; title: string },
    userId: string
  ): Promise<EntryGraphResponse> {
    const center = toEntrySummary(entry.category, entry.slug, entry.title);

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

    const nodesByPath = new Map<string, EntryLinkSummary>([[center.path, center]]);
    const edges: EntryGraphEdge[] = [];
    const connections: EntryGraphConnection[] = [];

    for (const link of outgoingLinks) {
      const target = toEntrySummary(link.targetEntry.category, link.targetEntry.slug, link.targetEntry.title);
      nodesByPath.set(target.path, target);
      edges.push({
        source: center.path,
        target: target.path,
        type: link.type
      });
      connections.push({
        direction: 'outgoing',
        via: link.type,
        reason: link.type === 'relationship' ? 'relationship to this entry' : 'mentioned by this entry',
        source: center,
        target,
        createdAt: link.createdAt.toISOString()
      });
    }

    for (const link of incomingLinks) {
      const source = toEntrySummary(link.sourceEntry.category, link.sourceEntry.slug, link.sourceEntry.title);
      nodesByPath.set(source.path, source);
      edges.push({
        source: source.path,
        target: center.path,
        type: link.type
      });
      connections.push({
        direction: 'incoming',
        via: link.type,
        reason: link.type === 'relationship' ? 'relationship to this entry' : 'mentions this entry',
        source,
        target: center,
        createdAt: link.createdAt.toISOString()
      });
    }

    return {
      center,
      nodes: Array.from(nodesByPath.values()),
      edges,
      connections
    };
  }

  private async resolveEntryByPath(path: string, userId: string): Promise<{
    id: string;
    category: string;
    slug: string;
    title: string;
  }> {
    const { category, slug } = parseEntryPath(path);
    const entry = await this.prisma.entry.findFirst({
      where: {
        userId,
        slug,
        category: { in: toLegacyCompatibleCategories(category) as any[] }
      }
    });
    if (!entry) {
      throw new EntryNotFoundError(path);
    }
    return entry;
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

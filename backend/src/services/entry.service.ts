import { v4 as uuidv4 } from 'uuid';
import { getPrismaClient } from '../lib/prisma';
import {
  Category,
  Channel,
  Entry,
  EntryWithPath,
  EntrySummary,
  EntryFilters,
  CreateEntryInput,
  UpdateEntryInput,
  BodyContentUpdate,
  PeopleEntry,
  ProjectsEntry,
  IdeasEntry,
  AdminEntry,
  InboxEntry
} from '../types/entry.types';
import { WebhookService, getWebhookService } from './webhook.service';
import { getConfig } from '../config/env';
import { requireUserId } from '../context/user-context';
import {
  BODY_SECTION,
  normalizeSectionKey,
  parseContentForStorage,
  renderContent
} from '../utils/entry-content';
import {
  isTaskCategory,
  isValidCategory,
  toCanonicalCategory,
  toLegacyCompatibleCategories,
  toStorageCategory
} from '../utils/category';

// ============================================
// Custom Errors
// ============================================

export class EntryNotFoundError extends Error {
  constructor(path: string) {
    super(`Entry not found: ${path}`);
    this.name = 'EntryNotFoundError';
  }
}

export class EntryAlreadyExistsError extends Error {
  constructor(path: string) {
    super(`Entry already exists: ${path}`);
    this.name = 'EntryAlreadyExistsError';
  }
}

export class InvalidEntryDataError extends Error {
  constructor(message: string, public details: Record<string, string> = {}) {
    super(message);
    this.name = 'InvalidEntryDataError';
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Generate a URL-safe slug from a name
 */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 50);
}

function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

function parseOptionalDateTime(value: unknown, fieldName: string): Date | null {
  if (value === undefined) return null;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new InvalidEntryDataError(`${fieldName} must be a valid ISO datetime string`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidEntryDataError(`${fieldName} must be a valid ISO datetime string`);
  }
  return parsed;
}

function parseOptionalDate(value: unknown, fieldName: string): Date | null {
  if (value === undefined) return null;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') {
    throw new InvalidEntryDataError(`${fieldName} must be a YYYY-MM-DD string`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new InvalidEntryDataError(`${fieldName} must be a YYYY-MM-DD string`);
  }
  return parsed;
}

function parseTaskDurationMinutes(value: unknown, fallback = 30): number {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InvalidEntryDataError('duration_minutes must be a positive integer');
  }
  const rounded = Math.floor(value);
  if (rounded < 5 || rounded > 720) {
    throw new InvalidEntryDataError('duration_minutes must be between 5 and 720');
  }
  return rounded;
}

function parseEntryPath(path: string): { category: Category; slug: string } {
  const [rawCategory, rawSlug] = path.split('/');
  if (!rawCategory || !rawSlug) {
    throw new InvalidEntryDataError(`Invalid entry path: ${path}`);
  }
  if (!isValidCategory(rawCategory)) {
    throw new InvalidEntryDataError(`Invalid category in path: ${path}`);
  }
  const category = toCanonicalCategory(rawCategory);
  const slug = rawSlug.endsWith('.md') ? rawSlug.slice(0, -3) : rawSlug;
  return { category, slug };
}

function buildEntryPath(category: Category, slug: string): string {
  return `${toCanonicalCategory(category)}/${slug}`;
}


// ============================================
// Entry Service Class
// ============================================

export class EntryService {
  private prisma = getPrismaClient();
  private webhookService: WebhookService;
  private revisionMaxPerEntry: number;
  private revisionMaxDays: number | null;

  constructor(webhookService?: WebhookService) {
    this.webhookService = webhookService || getWebhookService();
    const config = getConfig();
    this.revisionMaxPerEntry = config.ENTRY_REVISION_MAX_PER_ENTRY ?? 50;
    this.revisionMaxDays = config.ENTRY_REVISION_MAX_DAYS ?? null;
  }

  private getUserId(): string {
    return requireUserId();
  }

  async create(
    category: Category,
    data: CreateEntryInput,
    channel?: Channel,
    bodyContent?: string
  ): Promise<EntryWithPath> {
    const userId = this.getUserId();
    const now = new Date();
    const sourceChannel = channel || (data as any).source_channel || 'api';
    const storageCategory = toStorageCategory(category);

    let slug: string;
    let entryTitle: string;

    if (storageCategory === 'inbox') {
      const inboxData = data as any;
      entryTitle = inboxData.suggested_name || 'Untitled';
      const baseSlug = generateSlug(entryTitle || 'untitled');
      const timestamp = now
        .toISOString()
        .replace(/[-:]/g, '')
        .replace('T', '-')
        .replace(/\..+/, '');
      slug = `${timestamp}-${baseSlug}`;
    } else {
      const baseData = data as any;
      entryTitle = baseData.name;
      slug = generateSlug(entryTitle || 'untitled');
    }

    const existing = await this.prisma.entry.findUnique({
      where: {
        userId_category_slug: {
          userId,
          category: storageCategory,
          slug
        }
      }
    });

    if (existing) {
      throw new EntryAlreadyExistsError(buildEntryPath(storageCategory, slug));
    }

    const { sections, logs } = parseContentForStorage(bodyContent || '');

    const created = await this.prisma.$transaction(async (tx) => {
      const entry = await tx.entry.create({
        data: {
          userId,
          category: storageCategory,
          slug,
          title: entryTitle,
          confidence: (data as any).confidence,
          sourceChannel: sourceChannel
        }
      });

      if (storageCategory === 'people') {
        const payload = data as any;
        await tx.personDetails.create({
          data: {
            entryId: entry.id,
            context: payload.context || '',
            followUps: payload.follow_ups || [],
            relatedProjects: payload.related_projects || [],
            lastTouched: now
          }
        });
      }

      if (storageCategory === 'projects') {
        const payload = data as any;
        await tx.projectDetails.create({
          data: {
            entryId: entry.id,
            status: payload.status || 'active',
            nextAction: payload.next_action || '',
            relatedPeople: payload.related_people || [],
            dueDate: payload.due_date ? new Date(payload.due_date) : null
          }
        });
      }

      if (storageCategory === 'ideas') {
        const payload = data as any;
        await tx.ideaDetails.create({
          data: {
            entryId: entry.id,
            oneLiner: payload.one_liner || '',
            relatedProjects: payload.related_projects || []
          }
        });
      }

      if (isTaskCategory(storageCategory)) {
        const payload = data as any;
        const dueDate =
          parseOptionalDateTime(payload.due_at, 'due_at') ??
          parseOptionalDate(payload.due_date, 'due_date');
        await tx.adminTaskDetails.create({
          data: {
            entryId: entry.id,
            status: payload.status || 'pending',
            dueDate,
            durationMinutes: parseTaskDurationMinutes(payload.duration_minutes, 30),
            fixedAt: parseOptionalDateTime(payload.fixed_at, 'fixed_at')
          }
        });
      }

      if (storageCategory === 'inbox') {
        const payload = data as any;
        await tx.inboxDetails.create({
          data: {
            entryId: entry.id,
            originalText: payload.original_text,
            suggestedCategory: payload.suggested_category,
            suggestedName: payload.suggested_name,
            status: 'needs_review'
          }
        });
      }

      const tags = (data as any).tags || [];
      if (tags.length > 0) {
        await this.attachTags(tx, entry.id, tags, userId);
      }

      if (sections.length > 0) {
        await tx.entrySection.createMany({
          data: sections.map((section, index) => ({
            entryId: entry.id,
            key: section.key,
            title: section.title,
            order: index,
            contentMarkdown: section.contentMarkdown
          }))
        });
      }

      if (logs.length > 0) {
        await tx.entryLog.createMany({
          data: logs.map((log) => ({
            entryId: entry.id,
            channel: sourceChannel,
            message: log.message,
            createdAt: log.createdAt || now
          }))
        });
      }

      await this.createRevision(tx, entry.id, sourceChannel);

      return entry;
    });

    const entryWithPath = await this.read(buildEntryPath(storageCategory, slug));

    await this.logAudit(buildEntryPath(storageCategory, slug), created.id, 'create', sourceChannel);
    await this.emitWebhook('entry.created', {
      path: buildEntryPath(storageCategory, slug),
      category: toCanonicalCategory(storageCategory),
      entry: entryWithPath.entry,
      content: entryWithPath.content,
      channel: sourceChannel
    });

    return entryWithPath;
  }

  async read(path: string): Promise<EntryWithPath> {
    const { category, slug } = parseEntryPath(path);
    const userId = this.getUserId();
    const lookupCategories = toLegacyCompatibleCategories(category);
    const entry = await this.prisma.entry.findFirst({
      where: {
        userId,
        slug,
        category: { in: lookupCategories as any[] }
      },
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

    if (!entry) {
      throw new EntryNotFoundError(path);
    }

    const entryPayload = this.buildEntryPayload(entry);
    const content = renderContent(
      entry.sections.map((section) => ({
        key: section.key,
        title: section.title,
        contentMarkdown: section.contentMarkdown
      })),
      entry.logs.map((log) => ({ message: log.message, createdAt: log.createdAt }))
    );

    return {
      path: buildEntryPath(entry.category as Category, slug),
      category: toCanonicalCategory(entry.category),
      entry: entryPayload,
      content
    };
  }

  async list(category?: Category, filters?: EntryFilters): Promise<EntrySummary[]> {
    const userId = this.getUserId();
    const categoryFilter = category
      ? { category: { in: toLegacyCompatibleCategories(category) as any[] } }
      : {};
    const entries = await this.prisma.entry.findMany({
      where: {
        userId,
        ...categoryFilter
      },
      include: {
        projectDetails: true,
        adminDetails: true,
        ideaDetails: true,
        personDetails: true,
        inboxDetails: true
      },
      orderBy: { updatedAt: 'desc' }
    });

    return entries
      .filter((entry) => {
        if (!filters?.status) return true;
        const status = this.getEntryStatus(entry);
        return status === filters.status;
      })
      .map((entry) => {
        const summary: EntrySummary = {
          id: entry.id,
          path: buildEntryPath(toCanonicalCategory(entry.category), entry.slug),
          name: entry.title,
          category: toCanonicalCategory(entry.category),
          updated_at: entry.updatedAt.toISOString()
        };

        if (entry.category === 'projects' && entry.projectDetails) {
          summary.status = entry.projectDetails.status;
          summary.next_action = entry.projectDetails.nextAction || undefined;
          summary.due_date = entry.projectDetails.dueDate
            ? entry.projectDetails.dueDate.toISOString().split('T')[0]
            : undefined;
        }

        if (isTaskCategory(entry.category) && entry.adminDetails) {
          summary.status = entry.adminDetails.status;
          summary.due_date = entry.adminDetails.dueDate
            ? entry.adminDetails.dueDate.toISOString().split('T')[0]
            : undefined;
          summary.due_at = entry.adminDetails.dueDate
            ? entry.adminDetails.dueDate.toISOString()
            : undefined;
          summary.duration_minutes = entry.adminDetails.durationMinutes;
          summary.fixed_at = entry.adminDetails.fixedAt
            ? entry.adminDetails.fixedAt.toISOString()
            : undefined;
        }

        if (entry.category === 'ideas' && entry.ideaDetails) {
          summary.one_liner = entry.ideaDetails.oneLiner;
        }

        if (entry.category === 'people' && entry.personDetails) {
          summary.context = entry.personDetails.context;
          summary.last_touched = entry.personDetails.lastTouched
            ? entry.personDetails.lastTouched.toISOString().split('T')[0]
            : undefined;
        }

        if (entry.category === 'inbox' && entry.inboxDetails) {
          summary.original_text = entry.inboxDetails.originalText;
          summary.suggested_category = toCanonicalCategory(entry.inboxDetails.suggestedCategory);
          summary.status = entry.inboxDetails.status;
        }

        return summary;
      });
  }

  async update(
    path: string,
    updates: UpdateEntryInput,
    channel: Channel = 'api',
    bodyUpdate?: BodyContentUpdate,
    options?: { preserveUpdatedAt?: boolean }
  ): Promise<EntryWithPath> {
    const userId = this.getUserId();
    const { category, slug } = parseEntryPath(path);
    const existing = await this.prisma.entry.findFirst({
      where: {
        userId,
        slug,
        category: { in: toLegacyCompatibleCategories(category) as any[] }
      },
      include: {
        projectDetails: true,
        adminDetails: true,
        ideaDetails: true,
        personDetails: true,
        inboxDetails: true,
        tags: { include: { tag: true } }
      }
    });

    if (!existing) {
      throw new EntryNotFoundError(path);
    }

    const updatedEntry = await this.prisma.$transaction(async (tx) => {
      const updateData: Record<string, any> = {};
      if ((updates as any).name) {
        updateData.title = (updates as any).name;
      }
      if ((updates as any).suggested_name) {
        updateData.title = (updates as any).suggested_name;
      }
      if ((updates as any).confidence !== undefined) {
        updateData.confidence = (updates as any).confidence;
      }
      if ((updates as any).focus_minutes_total !== undefined) {
        updateData.focusMinutesTotal = (updates as any).focus_minutes_total;
      }
      if ((updates as any).focus_last_session) {
        updateData.focusLastSession = new Date((updates as any).focus_last_session);
      }

      if (existing.category === 'people') {
        await tx.personDetails.update({
          where: { entryId: existing.id },
          data: {
            context: (updates as any).context ?? existing.personDetails?.context,
            followUps: (updates as any).follow_ups ?? existing.personDetails?.followUps,
            relatedProjects: (updates as any).related_projects ?? existing.personDetails?.relatedProjects,
            lastTouched: new Date()
          }
        });
      }

      if (existing.category === 'projects') {
        await tx.projectDetails.update({
          where: { entryId: existing.id },
          data: {
            status: (updates as any).status ?? existing.projectDetails?.status,
            nextAction: (updates as any).next_action ?? existing.projectDetails?.nextAction,
            relatedPeople: (updates as any).related_people ?? existing.projectDetails?.relatedPeople,
            dueDate: (updates as any).due_date
              ? new Date((updates as any).due_date)
              : existing.projectDetails?.dueDate,
            stale: (updates as any).stale ?? existing.projectDetails?.stale,
            staleSince: (updates as any).stale_since
              ? new Date((updates as any).stale_since)
              : existing.projectDetails?.staleSince
          }
        });
      }

      if (existing.category === 'ideas') {
        await tx.ideaDetails.update({
          where: { entryId: existing.id },
          data: {
            oneLiner: (updates as any).one_liner ?? existing.ideaDetails?.oneLiner,
            relatedProjects: (updates as any).related_projects ?? existing.ideaDetails?.relatedProjects
          }
        });
      }

      if (isTaskCategory(existing.category)) {
        const hasDueAt = Object.prototype.hasOwnProperty.call(updates as any, 'due_at');
        const hasDueDate = Object.prototype.hasOwnProperty.call(updates as any, 'due_date');
        const hasDurationMinutes = Object.prototype.hasOwnProperty.call(updates as any, 'duration_minutes');
        const hasFixedAt = Object.prototype.hasOwnProperty.call(updates as any, 'fixed_at');

        let dueDateData: Date | null | undefined;
        if (hasDueAt) {
          dueDateData = parseOptionalDateTime((updates as any).due_at, 'due_at');
        } else if (hasDueDate) {
          dueDateData = parseOptionalDate((updates as any).due_date, 'due_date');
        }

        let durationMinutesData: number | undefined;
        if (hasDurationMinutes) {
          durationMinutesData = parseTaskDurationMinutes(
            (updates as any).duration_minutes,
            existing.adminDetails?.durationMinutes ?? 30
          );
        }

        let fixedAtData: Date | null | undefined;
        if (hasFixedAt) {
          fixedAtData = parseOptionalDateTime((updates as any).fixed_at, 'fixed_at');
        }

        await tx.adminTaskDetails.update({
          where: { entryId: existing.id },
          data: {
            status: (updates as any).status ?? existing.adminDetails?.status,
            dueDate: dueDateData,
            durationMinutes: durationMinutesData,
            fixedAt: fixedAtData
          }
        });
      }

      if (existing.category === 'inbox') {
        await tx.inboxDetails.update({
          where: { entryId: existing.id },
          data: {
            originalText: (updates as any).original_text ?? existing.inboxDetails?.originalText,
            suggestedCategory: (updates as any).suggested_category ?? existing.inboxDetails?.suggestedCategory,
            suggestedName: (updates as any).suggested_name ?? existing.inboxDetails?.suggestedName
          }
        });
      }

      if ((updates as any).tags) {
        await tx.entryTag.deleteMany({ where: { entryId: existing.id } });
        await this.attachTags(tx, existing.id, (updates as any).tags || [], userId);
      }

      if (bodyUpdate) {
        await this.applyBodyUpdate(tx, existing.id, bodyUpdate, channel);
      }

      const updated = await tx.entry.update({
        where: { id: existing.id },
        data: {
          ...updateData,
          updatedAt: options?.preserveUpdatedAt ? existing.updatedAt : undefined
        }
      });

      await this.createRevision(tx, existing.id, channel);

      return updated;
    });

    const result = await this.read(buildEntryPath(existing.category as Category, slug));
    await this.logAudit(buildEntryPath(existing.category as Category, slug), updatedEntry.id, 'update', channel);
    await this.emitWebhook('entry.updated', {
      path: result.path,
      category: result.category,
      entry: result.entry,
      content: result.content,
      channel,
      updates,
      bodyUpdate: bodyUpdate || undefined
    });
    return result;
  }

  async delete(path: string, channel: Channel = 'api'): Promise<void> {
    const userId = this.getUserId();
    const { category, slug } = parseEntryPath(path);
    const existing = await this.prisma.entry.findFirst({
      where: {
        userId,
        slug,
        category: { in: toLegacyCompatibleCategories(category) as any[] }
      }
    });

    if (!existing) {
      throw new EntryNotFoundError(path);
    }

    await this.prisma.$transaction(async (tx) => {
      await this.createRevision(tx, existing.id, channel);
      await tx.entry.delete({ where: { id: existing.id } });
    });

    await this.logAudit(buildEntryPath(existing.category as Category, slug), undefined, 'delete', channel);
    await this.emitWebhook('entry.deleted', {
      path: buildEntryPath(existing.category as Category, slug),
      category: toCanonicalCategory(existing.category),
      channel
    });
  }

  async move(path: string, targetCategory: Category, channel: Channel = 'api'): Promise<EntryWithPath> {
    const { category: sourceCategory, slug } = parseEntryPath(path);
    const existing = await this.read(path);
    const userId = this.getUserId();
    const storageTargetCategory = toStorageCategory(targetCategory);

    if (sourceCategory === storageTargetCategory) {
      return existing;
    }

    const transformed = this.transformEntryForCategory(existing, storageTargetCategory);
    const newSlug = generateSlug((transformed.entry as any).name || slug);

    const updated = await this.prisma.$transaction(async (tx) => {
      const entryRecord = await tx.entry.findFirst({
        where: {
          userId,
          slug,
          category: { in: toLegacyCompatibleCategories(sourceCategory) as any[] }
        }
      });
      if (!entryRecord) {
        throw new EntryNotFoundError(path);
      }

      const conflict = await tx.entry.findFirst({
        where: {
          userId,
          slug: newSlug,
          category: { in: toLegacyCompatibleCategories(storageTargetCategory) as any[] }
        }
      });
      if (conflict) {
        throw new EntryAlreadyExistsError(buildEntryPath(storageTargetCategory, newSlug));
      }

      await tx.entry.update({
        where: { id: entryRecord.id },
        data: {
          category: storageTargetCategory as any,
          slug: newSlug,
          title: (transformed.entry as any).name || entryRecord.title
        }
      });

      await tx.projectDetails.deleteMany({ where: { entryId: entryRecord.id } });
      await tx.adminTaskDetails.deleteMany({ where: { entryId: entryRecord.id } });
      await tx.ideaDetails.deleteMany({ where: { entryId: entryRecord.id } });
      await tx.personDetails.deleteMany({ where: { entryId: entryRecord.id } });
      await tx.inboxDetails.deleteMany({ where: { entryId: entryRecord.id } });

      if (storageTargetCategory === 'people') {
        const entry = transformed.entry as PeopleEntry;
        await tx.personDetails.create({
          data: {
            entryId: entryRecord.id,
            context: entry.context || '',
            followUps: entry.follow_ups || [],
            relatedProjects: entry.related_projects || [],
            lastTouched: new Date()
          }
        });
      }

      if (storageTargetCategory === 'projects') {
        const entry = transformed.entry as ProjectsEntry;
        await tx.projectDetails.create({
          data: {
            entryId: entryRecord.id,
            status: entry.status || 'active',
            nextAction: entry.next_action || '',
            relatedPeople: entry.related_people || [],
            dueDate: entry.due_date ? new Date(entry.due_date) : null
          }
        });
      }

      if (storageTargetCategory === 'ideas') {
        const entry = transformed.entry as IdeasEntry;
        await tx.ideaDetails.create({
          data: {
            entryId: entryRecord.id,
            oneLiner: entry.one_liner || '',
            relatedProjects: entry.related_projects || []
          }
        });
      }

      if (isTaskCategory(storageTargetCategory)) {
        const entry = transformed.entry as AdminEntry;
        const dueDate =
          parseOptionalDateTime(entry.due_at, 'due_at') ??
          parseOptionalDate(entry.due_date, 'due_date');
        await tx.adminTaskDetails.create({
          data: {
            entryId: entryRecord.id,
            status: entry.status || 'pending',
            dueDate,
            durationMinutes: parseTaskDurationMinutes(entry.duration_minutes, 30),
            fixedAt: parseOptionalDateTime(entry.fixed_at, 'fixed_at')
          }
        });
      }

      if (storageTargetCategory === 'inbox') {
        const entry = transformed.entry as InboxEntry;
        await tx.inboxDetails.create({
          data: {
            entryId: entryRecord.id,
            originalText: entry.original_text,
            suggestedCategory: entry.suggested_category,
            suggestedName: entry.suggested_name,
            status: 'needs_review'
          }
        });
      }

      await this.createRevision(tx, entryRecord.id, channel);

      return entryRecord.id;
    });

    const result = await this.read(buildEntryPath(storageTargetCategory, newSlug));
    await this.logAudit(result.path, updated, 'move', channel);
    await this.emitWebhook('entry.moved', {
      path: result.path,
      category: toCanonicalCategory(storageTargetCategory),
      entry: result.entry,
      content: result.content,
      channel
    });
    return result;
  }

  async merge(targetPath: string, sourcePaths: string[], channel: Channel = 'api'): Promise<EntryWithPath> {
    const sources = sourcePaths.filter((path) => path !== targetPath);
    if (sources.length === 0) {
      return this.read(targetPath);
    }

    const target = await this.read(targetPath);
    const category = target.category;
    const targetEntry = target.entry as any;

    const updates: Record<string, unknown> = {};
    const mergeNotes: string[] = [];

    const mergeTags = (current: string[] = [], next: string[] = []) => {
      return Array.from(new Set([...(current || []), ...(next || [])]));
    };

    const ensureArray = (value: unknown): string[] => Array.isArray(value) ? value : [];

    let mergedTags = mergeTags(targetEntry.tags || [], []);
    let mergedRelatedPeople = category === 'projects' ? ensureArray(targetEntry.related_people) : [];
    let mergedRelatedProjects = category === 'people' || category === 'ideas'
      ? ensureArray(targetEntry.related_projects)
      : [];
    let mergedFollowUps = category === 'people' ? ensureArray(targetEntry.follow_ups) : [];

    for (const sourcePath of sources) {
      const source = await this.read(sourcePath);
      if (source.category !== category) {
        throw new InvalidEntryDataError('Cannot merge entries across different categories');
      }
      const sourceEntry = source.entry as any;

      mergedTags = mergeTags(mergedTags, sourceEntry.tags || []);

      if (category === 'projects') {
        mergedRelatedPeople = mergeTags(mergedRelatedPeople, sourceEntry.related_people || []);
        if (!targetEntry.next_action && sourceEntry.next_action) {
          updates.next_action = sourceEntry.next_action;
        }
        if (!targetEntry.due_date && sourceEntry.due_date) {
          updates.due_date = sourceEntry.due_date;
        }
      }

      if (category === 'people') {
        mergedRelatedProjects = mergeTags(mergedRelatedProjects, sourceEntry.related_projects || []);
        mergedFollowUps = mergeTags(mergedFollowUps, sourceEntry.follow_ups || []);
        if (!targetEntry.context && sourceEntry.context) {
          updates.context = sourceEntry.context;
        }
      }

      if (category === 'ideas') {
        mergedRelatedProjects = mergeTags(mergedRelatedProjects, sourceEntry.related_projects || []);
        if (!targetEntry.one_liner && sourceEntry.one_liner) {
          updates.one_liner = sourceEntry.one_liner;
        }
      }

      if (isTaskCategory(category)) {
        if (!targetEntry.due_date && sourceEntry.due_date) {
          updates.due_date = sourceEntry.due_date;
        }
      }

      const displayName = sourceEntry.name || sourceEntry.suggested_name || sourcePath;
      if (source.content && source.content.trim().length > 0) {
        const indented = source.content.trim().replace(/\n/g, '\n  ');
        mergeNotes.push(`- From ${displayName} (${sourcePath}):\n  ${indented}`);
      } else {
        mergeNotes.push(`- From ${displayName} (${sourcePath})`);
      }
    }

    if (mergedTags.length && JSON.stringify(mergedTags) !== JSON.stringify(targetEntry.tags || [])) {
      updates.tags = mergedTags;
    }

    if (category === 'projects' && mergedRelatedPeople.length) {
      updates.related_people = mergedRelatedPeople;
    }
    if (category === 'people') {
      if (mergedRelatedProjects.length) updates.related_projects = mergedRelatedProjects;
      if (mergedFollowUps.length) updates.follow_ups = mergedFollowUps;
    }
    if (category === 'ideas' && mergedRelatedProjects.length) {
      updates.related_projects = mergedRelatedProjects;
    }

    const bodyUpdate = mergeNotes.length
      ? {
          mode: 'section' as const,
          section: 'Merged Notes',
          content: mergeNotes.join('\n')
        }
      : undefined;

    const updated = await this.update(targetPath, updates, channel, bodyUpdate);

    for (const sourcePath of sources) {
      await this.delete(sourcePath, channel);
    }

    return updated;
  }

  private buildEntryPayload(entry: any): Entry {
    const tags = entry.tags?.map((tag: any) => tag.tag.name) ?? [];
    const base = {
      id: entry.id,
      name: entry.title,
      tags,
      created_at: entry.createdAt.toISOString(),
      updated_at: entry.updatedAt.toISOString(),
      source_channel: entry.sourceChannel || 'api',
      confidence: entry.confidence,
      focus_minutes_total: entry.focusMinutesTotal || 0,
      focus_last_session: entry.focusLastSession ? entry.focusLastSession.toISOString() : undefined
    };

    switch (entry.category) {
      case 'people':
        return {
          ...base,
          context: entry.personDetails?.context || '',
          follow_ups: entry.personDetails?.followUps || [],
          related_projects: entry.personDetails?.relatedProjects || [],
          last_touched: entry.personDetails?.lastTouched
            ? entry.personDetails.lastTouched.toISOString().split('T')[0]
            : getCurrentDate()
        } as PeopleEntry;
      case 'projects':
        return {
          ...base,
          status: entry.projectDetails?.status || 'active',
          next_action: entry.projectDetails?.nextAction || '',
          related_people: entry.projectDetails?.relatedPeople || [],
          due_date: entry.projectDetails?.dueDate
            ? entry.projectDetails.dueDate.toISOString().split('T')[0]
            : undefined,
          stale: entry.projectDetails?.stale || false,
          stale_since: entry.projectDetails?.staleSince
            ? entry.projectDetails.staleSince.toISOString()
            : undefined
        } as ProjectsEntry;
      case 'ideas':
        return {
          ...base,
          one_liner: entry.ideaDetails?.oneLiner || '',
          related_projects: entry.ideaDetails?.relatedProjects || []
        } as IdeasEntry;
      case 'task':
      case 'admin':
        return {
          ...base,
          status: entry.adminDetails?.status || 'pending',
          due_date: entry.adminDetails?.dueDate
            ? entry.adminDetails.dueDate.toISOString().split('T')[0]
            : undefined,
          due_at: entry.adminDetails?.dueDate
            ? entry.adminDetails.dueDate.toISOString()
            : undefined,
          duration_minutes: entry.adminDetails?.durationMinutes ?? 30,
          fixed_at: entry.adminDetails?.fixedAt
            ? entry.adminDetails.fixedAt.toISOString()
            : undefined
        } as AdminEntry;
      case 'inbox':
        return {
          id: entry.id,
          original_text: entry.inboxDetails?.originalText || '',
          suggested_category: toCanonicalCategory(entry.inboxDetails?.suggestedCategory || 'inbox'),
          suggested_name: entry.inboxDetails?.suggestedName || entry.title,
          confidence: entry.confidence,
          status: entry.inboxDetails?.status || 'needs_review',
          source_channel: entry.sourceChannel || 'api',
          created_at: entry.createdAt.toISOString()
        } as InboxEntry;
      default:
        throw new InvalidEntryDataError(`Unknown category: ${entry.category}`);
    }
  }

  private getEntryStatus(entry: any): string | undefined {
    if (entry.category === 'projects') return entry.projectDetails?.status;
    if (isTaskCategory(entry.category)) return entry.adminDetails?.status;
    if (entry.category === 'inbox') return entry.inboxDetails?.status;
    return undefined;
  }

  private transformEntryForCategory(
    existing: EntryWithPath,
    targetCategory: Category
  ): { entry: Entry; bodyContent: string } {
    const sourceCategory = existing.category;
    const entry = existing.entry as any;

    const base = sourceCategory === 'inbox'
      ? {
          id: entry.id,
          name: entry.suggested_name,
          tags: [],
          created_at: entry.created_at,
          updated_at: entry.updated_at || entry.created_at,
          source_channel: entry.source_channel,
          confidence: entry.confidence
        }
      : {
          id: entry.id,
          name: entry.name,
          tags: entry.tags || [],
          created_at: entry.created_at,
          updated_at: entry.updated_at || entry.created_at,
          source_channel: entry.source_channel,
          confidence: entry.confidence
        };

    let transformed: Entry;
    switch (targetCategory) {
      case 'people':
        transformed = {
          ...base,
          context: '',
          follow_ups: [],
          related_projects: [],
          last_touched: getCurrentDate()
        } as PeopleEntry;
        break;
      case 'projects':
        transformed = {
          ...base,
          status: 'active',
          next_action: '',
          related_people: []
        } as ProjectsEntry;
        break;
      case 'ideas':
        transformed = {
          ...base,
          one_liner: '',
          related_projects: []
        } as IdeasEntry;
        break;
      case 'task':
      case 'admin':
        transformed = {
          ...base,
          status: 'pending',
          duration_minutes: 30
        } as AdminEntry;
        break;
      case 'inbox':
        transformed = {
          id: entry.id,
          original_text: entry.original_text || existing.content,
          suggested_category: toCanonicalCategory(sourceCategory),
          suggested_name: entry.name || entry.suggested_name || 'Inbox item',
          confidence: entry.confidence,
          status: 'needs_review',
          source_channel: entry.source_channel || 'api',
          created_at: entry.created_at
        } as InboxEntry;
        break;
      default:
        throw new InvalidEntryDataError(`Unknown category: ${targetCategory}`);
    }

    const bodyContent = sourceCategory === 'inbox' ? '' : existing.content;

    return { entry: transformed, bodyContent };
  }

  private async attachTags(tx: any, entryId: string, tags: string[], userId: string): Promise<void> {
    const uniqueTags = Array.from(new Set(tags.map((tag) => tag.trim()).filter(Boolean)));
    if (uniqueTags.length === 0) return;

    const existing = await tx.tag.findMany({ where: { userId, name: { in: uniqueTags } } });
    const existingNames = new Set(existing.map((tag: any) => tag.name));
    const toCreate = uniqueTags.filter((name) => !existingNames.has(name));

    if (toCreate.length > 0) {
      await tx.tag.createMany({ data: toCreate.map((name) => ({ name, userId })) });
    }

    const allTags = await tx.tag.findMany({ where: { userId, name: { in: uniqueTags } } });
    await tx.entryTag.createMany({
      data: allTags.map((tag: any) => ({ entryId, tagId: tag.id }))
    });
  }

  private async applyBodyUpdate(tx: any, entryId: string, update: BodyContentUpdate, channel: Channel): Promise<void> {
    const existingSections = await tx.entrySection.findMany({
      where: { entryId },
      orderBy: { order: 'asc' }
    });

    if (update.mode === 'replace') {
      await tx.entrySection.deleteMany({ where: { entryId } });
      await tx.entryLog.deleteMany({ where: { entryId } });
      const parsed = parseContentForStorage(update.content);
      if (parsed.sections.length > 0) {
        await tx.entrySection.createMany({
          data: parsed.sections.map((section, index) => ({
            entryId,
            key: section.key,
            title: section.title,
            order: index,
            contentMarkdown: section.contentMarkdown
          }))
        });
      }
      if (parsed.logs.length > 0) {
        await tx.entryLog.createMany({
          data: parsed.logs.map((log) => ({
            entryId,
            channel,
            message: log.message,
            createdAt: log.createdAt || new Date()
          }))
        });
      }
      return;
    }

    if (update.mode === 'append') {
      if (existingSections.length === 0) {
        await tx.entrySection.create({
          data: {
            entryId,
            key: BODY_SECTION,
            title: 'Body',
            order: 0,
            contentMarkdown: update.content
          }
        });
        return;
      }

      const targetSection = existingSections.find((section: any) => section.key === BODY_SECTION)
        || existingSections[existingSections.length - 1];

      const appended = `${targetSection.contentMarkdown.trimEnd()}\n\n${update.content}`.trim();
      await tx.entrySection.update({
        where: { id: targetSection.id },
        data: { contentMarkdown: appended }
      });
      return;
    }

    if (update.mode === 'section') {
      if (!update.section) {
        throw new InvalidEntryDataError('Section name required for section mode');
      }

      if (update.section.toLowerCase() === 'log') {
        const message = update.content.trim();
        await tx.entryLog.create({
          data: {
            entryId,
            channel,
            message
          }
        });
        return;
      }

      const key = normalizeSectionKey(update.section);
      const existing = existingSections.find((section: any) => section.key === key);
      if (existing) {
        const appended = `${existing.contentMarkdown.trimEnd()}\n${update.content}`.trim();
        await tx.entrySection.update({
          where: { id: existing.id },
          data: { contentMarkdown: appended }
        });
        return;
      }

      const order = existingSections.length;
      await tx.entrySection.create({
        data: {
          entryId,
          key,
          title: update.section,
          order,
          contentMarkdown: update.content
        }
      });
      return;
    }
  }

  private async createRevision(tx: any, entryId: string, channel: Channel): Promise<void> {
    const entry = await tx.entry.findUnique({
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

    if (!entry) return;

    const latest = await tx.entryRevision.findFirst({
      where: { entryId },
      orderBy: { revision: 'desc' }
    });

    const snapshot = {
      entry: {
        category: entry.category,
        slug: entry.slug,
        title: entry.title,
        confidence: entry.confidence,
        sourceChannel: entry.sourceChannel,
        createdAt: entry.createdAt,
        updatedAt: entry.updatedAt,
        lastTouched: entry.lastTouched,
        focusMinutesTotal: entry.focusMinutesTotal,
        focusLastSession: entry.focusLastSession
      },
      details: {
        project: entry.projectDetails,
        admin: entry.adminDetails,
        idea: entry.ideaDetails,
        person: entry.personDetails,
        inbox: entry.inboxDetails
      },
      sections: entry.sections,
      logs: entry.logs,
      tags: entry.tags.map((tag: any) => tag.tag.name)
    };

    const nextRevision = (latest?.revision || 0) + 1;
    await tx.entryRevision.create({
      data: {
        entryId,
        revision: nextRevision,
        snapshot,
        channel
      }
    });

    await this.pruneRevisions(tx, entryId);
  }

  private async pruneRevisions(tx: any, entryId: string): Promise<void> {
    const maxPerEntry = this.revisionMaxPerEntry;
    if (maxPerEntry && maxPerEntry > 0) {
      const revisions = await tx.entryRevision.findMany({
        where: { entryId },
        orderBy: { revision: 'desc' },
        skip: maxPerEntry
      });
      if (revisions.length > 0) {
        await tx.entryRevision.deleteMany({
          where: { id: { in: revisions.map((rev: any) => rev.id) } }
        });
      }
    }

    if (this.revisionMaxDays && this.revisionMaxDays > 0) {
      const cutoff = new Date(Date.now() - this.revisionMaxDays * 24 * 60 * 60 * 1000);
      await tx.entryRevision.deleteMany({
        where: {
          entryId,
          createdAt: { lt: cutoff }
        }
      });
    }
  }

  private async logAudit(
    entryPath: string,
    entryId: string | undefined,
    operation: 'create' | 'update' | 'delete' | 'move',
    channel: Channel
  ): Promise<void> {
    const userId = this.getUserId();
    try {
      await this.prisma.entryAuditLog.create({
        data: {
          userId,
          entryPath,
          entryId: entryId ?? null,
          operation,
          channel
        }
      });
    } catch (error) {
      console.warn('EntryService: Failed to write audit log', error);
    }
  }

  private async emitWebhook(event: string, payload: Record<string, unknown>): Promise<void> {
    try {
      if (this.webhookService?.hasWebhooks()) {
        const webhookEvent = this.webhookService.buildEvent(event, payload);
        await this.webhookService.deliver(webhookEvent);
      }
    } catch (error) {
      console.warn('EntryService: Failed to deliver webhook', error);
    }
  }
}

let entryServiceInstance: EntryService | null = null;

export function getEntryService(): EntryService {
  if (!entryServiceInstance) {
    entryServiceInstance = new EntryService();
  }
  return entryServiceInstance;
}

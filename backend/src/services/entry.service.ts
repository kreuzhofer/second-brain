import matter from 'gray-matter';
import { v4 as uuidv4 } from 'uuid';
import { readFile, writeFile, readdir, unlink, access, constants } from 'fs/promises';
import { join, basename, dirname } from 'path';
import { getConfig } from '../config/env';
import {
  Category,
  Channel,
  Entry,
  EntryWithPath,
  EntrySummary,
  EntryFilters,
  CreateEntryInput,
  UpdateEntryInput,
  PeopleEntry,
  ProjectsEntry,
  IdeasEntry,
  AdminEntry,
  InboxEntry
} from '../types/entry.types';
import {
  GitService,
  getGitService,
  formatCreateCommit,
  formatUpdateCommit,
  formatDeleteCommit
} from './git.service';
import { IndexService, getIndexService } from './index.service';

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

/**
 * Get the file path for an entry
 */
function getEntryPath(category: Category, slug: string, timestamp?: string): string {
  if (category === 'inbox' && timestamp) {
    return `inbox/${timestamp}-${slug}.md`;
  }
  return `${category}/${slug}.md`;
}

/**
 * Get the full file system path for an entry
 */
function getFullPath(dataPath: string, entryPath: string): string {
  return join(dataPath, entryPath);
}

/**
 * Extract category from entry path
 */
function getCategoryFromPath(path: string): Category {
  const category = path.split('/')[0] as Category;
  if (!['people', 'projects', 'ideas', 'admin', 'inbox'].includes(category)) {
    throw new InvalidEntryDataError(`Invalid category in path: ${path}`);
  }
  return category;
}

/**
 * Get current ISO timestamp
 */
function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Get current ISO date (without time)
 */
function getCurrentDate(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * Format timestamp for inbox file naming
 */
function getInboxTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

// ============================================
// Entry Service Class
// ============================================

export class EntryService {
  private dataPath: string;
  private gitService: GitService;
  private indexService: IndexService;

  constructor(dataPath?: string, gitService?: GitService, indexService?: IndexService) {
    this.dataPath = dataPath || getConfig().DATA_PATH;
    this.gitService = gitService || getGitService(this.dataPath);
    this.indexService = indexService || getIndexService(this.dataPath);
  }

  /**
   * Create a new entry
   */
  async create(category: Category, data: CreateEntryInput, channel?: Channel): Promise<EntryWithPath> {
    const now = getCurrentTimestamp();
    const id = uuidv4();
    const sourceChannel = channel || (data as any).source_channel || 'api';
    
    let entry: Entry;
    let slug: string;
    let entryPath: string;

    if (category === 'inbox') {
      const inboxData = data as any;
      slug = generateSlug(inboxData.suggested_name || 'untitled');
      entryPath = getEntryPath('inbox', slug, getInboxTimestamp());
      
      const inboxEntry: Record<string, any> = {
        id,
        original_text: inboxData.original_text,
        suggested_category: inboxData.suggested_category,
        suggested_name: inboxData.suggested_name,
        status: 'needs_review',
        source_channel: sourceChannel,
        created_at: now
      };
      
      // Only add confidence if defined
      if (inboxData.confidence !== undefined) {
        inboxEntry.confidence = inboxData.confidence;
      }
      
      entry = inboxEntry as InboxEntry;
    } else {
      const baseData = data as any;
      slug = generateSlug(baseData.name);
      entryPath = getEntryPath(category, slug);

      const baseEntry: Record<string, any> = {
        id,
        name: baseData.name,
        tags: baseData.tags || [],
        created_at: now,
        updated_at: now,
        source_channel: sourceChannel
      };
      
      // Only add confidence if it's defined
      if (baseData.confidence !== undefined) {
        baseEntry.confidence = baseData.confidence;
      }

      switch (category) {
        case 'people':
          entry = {
            ...baseEntry,
            context: baseData.context || '',
            follow_ups: baseData.follow_ups || [],
            related_projects: baseData.related_projects || [],
            last_touched: getCurrentDate()
          } as PeopleEntry;
          break;
        case 'projects': {
          const projectEntry: Record<string, any> = {
            ...baseEntry,
            status: baseData.status || 'active',
            next_action: baseData.next_action || '',
            related_people: baseData.related_people || []
          };
          if (baseData.due_date) {
            projectEntry.due_date = baseData.due_date;
          }
          entry = projectEntry as ProjectsEntry;
          break;
        }
        case 'ideas':
          entry = {
            ...baseEntry,
            one_liner: baseData.one_liner || '',
            related_projects: baseData.related_projects || []
          } as IdeasEntry;
          break;
        case 'admin': {
          const adminEntry: Record<string, any> = {
            ...baseEntry,
            status: baseData.status || 'pending'
          };
          if (baseData.due_date) {
            adminEntry.due_date = baseData.due_date;
          }
          entry = adminEntry as AdminEntry;
          break;
        }
        default:
          throw new InvalidEntryDataError(`Unknown category: ${category}`);
      }
    }

    // Check if file already exists
    const fullPath = getFullPath(this.dataPath, entryPath);
    try {
      await access(fullPath, constants.F_OK);
      throw new EntryAlreadyExistsError(entryPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        if (err instanceof EntryAlreadyExistsError) throw err;
      }
    }

    // Serialize to markdown with frontmatter
    const content = matter.stringify('', entry);
    await writeFile(fullPath, content, 'utf-8');

    // Regenerate index
    await this.indexService.regenerate();

    // Create git commit (includes both entry and index)
    const entryName = category === 'inbox' 
      ? (entry as InboxEntry).suggested_name 
      : (entry as any).name;
    const commitMessage = formatCreateCommit(category, entryName, entry.confidence, sourceChannel);
    await this.gitService.commit(commitMessage, [entryPath, 'index.md']);

    return {
      path: entryPath,
      category,
      entry,
      content: ''
    };
  }

  /**
   * Read an entry by path
   */
  async read(path: string): Promise<EntryWithPath> {
    const fullPath = getFullPath(this.dataPath, path);
    
    try {
      const fileContent = await readFile(fullPath, 'utf-8');
      const { data, content } = matter(fileContent);
      const category = getCategoryFromPath(path);
      
      return {
        path,
        category,
        entry: data as Entry,
        content: content.trim()
      };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new EntryNotFoundError(path);
      }
      throw err;
    }
  }

  /**
   * Update an existing entry
   */
  async update(path: string, updates: UpdateEntryInput, channel: Channel = 'api'): Promise<EntryWithPath> {
    // Read existing entry
    const existing = await this.read(path);
    const category = existing.category;
    const now = getCurrentTimestamp();

    // Merge updates with existing data
    const updatedEntry = {
      ...existing.entry,
      ...updates,
      updated_at: now
    };

    // Update last_touched for people entries
    if (category === 'people') {
      (updatedEntry as PeopleEntry).last_touched = getCurrentDate();
    }

    // Serialize to markdown, preserving content section
    const content = matter.stringify(existing.content || '', updatedEntry);
    const fullPath = getFullPath(this.dataPath, path);
    await writeFile(fullPath, content, 'utf-8');

    // Regenerate index
    await this.indexService.regenerate();

    // Create git commit
    const entryName = category === 'inbox'
      ? (updatedEntry as InboxEntry).suggested_name
      : (updatedEntry as any).name;
    const changeSummary = Object.keys(updates).join(', ') + ' updated';
    const commitMessage = formatUpdateCommit(category, entryName, changeSummary, channel);
    await this.gitService.commit(commitMessage, [path, 'index.md']);

    return {
      path,
      category,
      entry: updatedEntry as Entry,
      content: existing.content
    };
  }

  /**
   * Delete an entry
   */
  async delete(path: string, channel: Channel = 'api'): Promise<void> {
    // Read entry first to get name for commit message
    const existing = await this.read(path);
    const category = existing.category;
    const entryName = category === 'inbox'
      ? (existing.entry as InboxEntry).suggested_name
      : (existing.entry as any).name;

    // Delete the file
    const fullPath = getFullPath(this.dataPath, path);
    await unlink(fullPath);

    // Regenerate index
    await this.indexService.regenerate();

    // Create git commit for deletion and index update
    const commitMessage = formatDeleteCommit(category, entryName, channel);
    
    // Stage the index update first, then commit the deletion
    await this.gitService.commit(commitMessage, ['index.md']);
    // Note: The file is already deleted, git will track this
  }

  /**
   * List entries with optional filters
   */
  async list(category?: Category, filters?: EntryFilters): Promise<EntrySummary[]> {
    const categories = category ? [category] : ['people', 'projects', 'ideas', 'admin', 'inbox'] as Category[];
    const summaries: EntrySummary[] = [];

    for (const cat of categories) {
      const categoryPath = join(this.dataPath, cat);
      
      try {
        const files = await readdir(categoryPath);
        
        for (const file of files) {
          if (!file.endsWith('.md')) continue;
          
          const entryPath = `${cat}/${file}`;
          try {
            const entry = await this.read(entryPath);
            const data = entry.entry as any;
            
            // Apply status filter if provided
            if (filters?.status && data.status !== filters.status) {
              continue;
            }

            const summary: EntrySummary = {
              path: entryPath,
              name: data.name || data.suggested_name || basename(file, '.md'),
              category: cat,
              updated_at: data.updated_at || data.created_at
            };

            // Add category-specific fields
            if (cat === 'projects' || cat === 'admin') {
              summary.status = data.status;
            }
            if (cat === 'projects') {
              summary.next_action = data.next_action;
              summary.due_date = data.due_date;
            }
            if (cat === 'ideas') {
              summary.one_liner = data.one_liner;
            }
            if (cat === 'admin') {
              summary.due_date = data.due_date;
            }
            if (cat === 'people') {
              summary.context = data.context;
              summary.last_touched = data.last_touched;
            }
            if (cat === 'inbox') {
              summary.original_text = data.original_text;
              summary.suggested_category = data.suggested_category;
            }

            summaries.push(summary);
          } catch {
            // Skip files that can't be read
          }
        }
      } catch {
        // Category folder might not exist yet
      }
    }

    // Sort by updated_at descending
    summaries.sort((a, b) => 
      new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );

    return summaries;
  }
}

// Export singleton instance
let entryServiceInstance: EntryService | null = null;

export function getEntryService(dataPath?: string): EntryService {
  if (!entryServiceInstance || dataPath) {
    entryServiceInstance = new EntryService(dataPath);
  }
  return entryServiceInstance;
}

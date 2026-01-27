/**
 * Search Service
 * Provides full-text search across entries in the Second Brain application.
 * Searches entry names, one-liners, context fields, and markdown content.
 */

import { EntryService, getEntryService } from './entry.service';
import { Category } from '../types/entry.types';

// ============================================
// Types
// ============================================

export interface SearchOptions {
  category?: Category;
  limit?: number;
}

export interface SearchResult {
  entries: SearchHit[];
  total: number;
}

export interface SearchHit {
  path: string;
  name: string;
  category: Category;
  matchedField: string;
  snippet: string;
}

interface MatchInfo {
  field: string;
  count: number;
  snippet: string;
}

// ============================================
// Search Service Class
// ============================================

export class SearchService {
  private entryService: EntryService;

  constructor(entryService?: EntryService) {
    this.entryService = entryService || getEntryService();
  }

  /**
   * Search entries by query
   * @param query - The search query string
   * @param options - Optional search options (category filter, limit)
   * @returns SearchResult with matching entries sorted by relevance
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    // Handle empty query
    if (!query || query.trim().length === 0) {
      return { entries: [], total: 0 };
    }

    const normalizedQuery = query.toLowerCase().trim();
    const category = options?.category;
    const limit = options?.limit;

    // Get all entries (optionally filtered by category)
    const entries = await this.entryService.list(category);

    // Search and score each entry
    const scoredHits: Array<{ hit: SearchHit; matchCount: number }> = [];

    for (const entrySummary of entries) {
      // Read full entry to get content
      const fullEntry = await this.entryService.read(entrySummary.path);
      const entry = fullEntry.entry as unknown as Record<string, unknown>;
      const content = fullEntry.content || '';

      // Search across all relevant fields
      const matchInfo = this.findBestMatch(
        normalizedQuery,
        entrySummary.name,
        entry,
        content,
        entrySummary.category
      );

      if (matchInfo) {
        scoredHits.push({
          hit: {
            path: entrySummary.path,
            name: entrySummary.name,
            category: entrySummary.category,
            matchedField: matchInfo.field,
            snippet: matchInfo.snippet
          },
          matchCount: matchInfo.count
        });
      }
    }

    // Sort by relevance (match count, descending)
    scoredHits.sort((a, b) => b.matchCount - a.matchCount);

    // Apply limit
    const limitedHits = limit !== undefined ? scoredHits.slice(0, limit) : scoredHits;

    return {
      entries: limitedHits.map(sh => sh.hit),
      total: scoredHits.length
    };
  }

  /**
   * Find the best match across all searchable fields
   * Returns match info with the field that has the most matches
   */
  private findBestMatch(
    query: string,
    name: string,
    entry: Record<string, unknown>,
    content: string,
    category: Category
  ): MatchInfo | null {
    const matches: MatchInfo[] = [];

    // Search in name
    const nameMatches = this.countMatches(name, query);
    if (nameMatches > 0) {
      matches.push({
        field: 'name',
        count: nameMatches,
        snippet: this.createSnippet(name, query)
      });
    }

    // Search in one_liner (ideas category)
    if (category === 'ideas' && typeof entry.one_liner === 'string') {
      const oneLinerMatches = this.countMatches(entry.one_liner, query);
      if (oneLinerMatches > 0) {
        matches.push({
          field: 'one_liner',
          count: oneLinerMatches,
          snippet: this.createSnippet(entry.one_liner, query)
        });
      }
    }

    // Search in context (people category)
    if (category === 'people' && typeof entry.context === 'string') {
      const contextMatches = this.countMatches(entry.context, query);
      if (contextMatches > 0) {
        matches.push({
          field: 'context',
          count: contextMatches,
          snippet: this.createSnippet(entry.context, query)
        });
      }
    }

    // Search in content (markdown body)
    if (content) {
      const contentMatches = this.countMatches(content, query);
      if (contentMatches > 0) {
        matches.push({
          field: 'content',
          count: contentMatches,
          snippet: this.createSnippet(content, query)
        });
      }
    }

    // Search in original_text (inbox category)
    if (category === 'inbox' && typeof entry.original_text === 'string') {
      const originalTextMatches = this.countMatches(entry.original_text, query);
      if (originalTextMatches > 0) {
        matches.push({
          field: 'original_text',
          count: originalTextMatches,
          snippet: this.createSnippet(entry.original_text, query)
        });
      }
    }

    if (matches.length === 0) {
      return null;
    }

    // Return the match with the highest count
    // If tied, prefer name > one_liner > context > content > original_text
    const fieldPriority = ['name', 'one_liner', 'context', 'content', 'original_text'];
    matches.sort((a, b) => {
      if (b.count !== a.count) {
        return b.count - a.count;
      }
      return fieldPriority.indexOf(a.field) - fieldPriority.indexOf(b.field);
    });

    // Calculate total match count across all fields for relevance sorting
    const totalCount = matches.reduce((sum, m) => sum + m.count, 0);

    return {
      field: matches[0].field,
      count: totalCount,
      snippet: matches[0].snippet
    };
  }

  /**
   * Count occurrences of query in text (case-insensitive)
   */
  private countMatches(text: string, query: string): number {
    if (!text) return 0;
    const normalizedText = text.toLowerCase();
    let count = 0;
    let pos = 0;
    
    while ((pos = normalizedText.indexOf(query, pos)) !== -1) {
      count++;
      pos += query.length;
    }
    
    return count;
  }

  /**
   * Create a snippet showing context around the match
   */
  private createSnippet(text: string, query: string): string {
    if (!text) return '';
    
    const normalizedText = text.toLowerCase();
    const matchIndex = normalizedText.indexOf(query);
    
    if (matchIndex === -1) {
      // No match found, return truncated text
      return text.length > 100 ? text.substring(0, 100) + '...' : text;
    }

    // Calculate snippet boundaries
    const snippetLength = 100;
    const contextBefore = 30;
    
    let start = Math.max(0, matchIndex - contextBefore);
    let end = Math.min(text.length, start + snippetLength);
    
    // Adjust start if we're near the end
    if (end === text.length && end - start < snippetLength) {
      start = Math.max(0, end - snippetLength);
    }

    let snippet = text.substring(start, end);
    
    // Add ellipsis if truncated
    if (start > 0) {
      snippet = '...' + snippet;
    }
    if (end < text.length) {
      snippet = snippet + '...';
    }

    return snippet;
  }
}

// ============================================
// Singleton Instance
// ============================================

let searchServiceInstance: SearchService | null = null;

export function getSearchService(entryService?: EntryService): SearchService {
  if (!searchServiceInstance || entryService) {
    searchServiceInstance = new SearchService(entryService);
  }
  return searchServiceInstance;
}

export function resetSearchService(): void {
  searchServiceInstance = null;
}

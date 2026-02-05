/**
 * Duplicate Detection Service
 * Finds likely duplicate entries using hybrid search and similarity checks.
 */

import { Category } from '../types/entry.types';
import { SearchService, getSearchService, SearchHit } from './search.service';
import { getConfig } from '../config/env';
import { EntryService, getEntryService } from './entry.service';

export interface DuplicateHit extends SearchHit {
  score: number;
  reason: 'semantic_similarity' | 'name_similarity';
}

export interface DuplicateQuery {
  name?: string;
  text?: string;
  category?: Category;
  limit?: number;
  excludePath?: string;
}

export class DuplicateService {
  private searchService: SearchService;
  private entryService: EntryService;
  private semanticThreshold: number;
  private nameThreshold: number;

  constructor(searchService?: SearchService, entryService?: EntryService) {
    this.searchService = searchService || getSearchService();
    this.entryService = entryService || getEntryService();
    const semantic = parseFloat(process.env.DUPLICATE_SEMANTIC_THRESHOLD || '0.88');
    const name = parseFloat(process.env.DUPLICATE_NAME_THRESHOLD || '0.8');
    this.semanticThreshold = Number.isFinite(semantic) ? semantic : 0.88;
    this.nameThreshold = Number.isFinite(name) ? name : 0.8;
    void getConfig();
  }

  async findDuplicatesForText(query: DuplicateQuery): Promise<DuplicateHit[]> {
    const searchQuery = query.text || query.name;
    if (!searchQuery) {
      return [];
    }

    const result = await this.searchService.search(searchQuery, {
      category: query.category,
      limit: query.limit ?? 10
    });

    return this.filterDuplicates(result.entries, query.name, query.excludePath);
  }

  async findDuplicatesForEntry(path: string, limit?: number): Promise<DuplicateHit[]> {
    const entry = await this.entryService.read(path);
    const queryText = entry.content || (entry.entry as any).name || '';
    return this.findDuplicatesForText({
      text: queryText,
      name: (entry.entry as any).name,
      category: entry.category,
      limit,
      excludePath: path
    });
  }

  private filterDuplicates(entries: SearchHit[], name?: string, excludePath?: string): DuplicateHit[] {
    const duplicates: DuplicateHit[] = [];

    for (const entry of entries) {
      if (excludePath && entry.path === excludePath) {
        continue;
      }

      const semanticScore = entry.semanticScore ?? 0;
      const nameSimilarity = name ? this.computeNameSimilarity(name, entry.name) : 0;

      if (semanticScore >= this.semanticThreshold) {
        duplicates.push({
          ...entry,
          score: semanticScore,
          reason: 'semantic_similarity'
        });
        continue;
      }

      if (nameSimilarity >= this.nameThreshold) {
        duplicates.push({
          ...entry,
          score: nameSimilarity,
          reason: 'name_similarity'
        });
      }
    }

    return duplicates;
  }

  private computeNameSimilarity(a: string, b: string): number {
    const tokensA = this.tokenize(a);
    const tokensB = this.tokenize(b);
    if (tokensA.size === 0 || tokensB.size === 0) return 0;
    let intersection = 0;
    for (const token of tokensA) {
      if (tokensB.has(token)) intersection += 1;
    }
    const union = new Set([...tokensA, ...tokensB]).size;
    return union === 0 ? 0 : intersection / union;
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .split(' ')
        .map((token) => token.trim())
        .filter(Boolean)
    );
  }
}

let duplicateServiceInstance: DuplicateService | null = null;

export function getDuplicateService(): DuplicateService {
  if (!duplicateServiceInstance) {
    duplicateServiceInstance = new DuplicateService();
  }
  return duplicateServiceInstance;
}

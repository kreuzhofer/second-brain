/**
 * Search Service
 * Provides keyword + semantic search across entries using PostgreSQL + pgvector.
 */

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { getPrismaClient } from '../lib/prisma';
import { EntryService, getEntryService } from './entry.service';
import { Category } from '../types/entry.types';
import { getConfig } from '../config/env';
import { EmbeddingService, OpenAIEmbeddingService } from './embedding.service';
import { requireUserId } from '../context/user-context';

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
  highlightRanges?: Array<{ start: number; end: number }>;
  score?: number;
  keywordScore?: number;
  semanticScore?: number;
}

interface MatchInfo {
  field: string;
  count: number;
  snippet: string;
  highlightRanges: Array<{ start: number; end: number }>;
}

interface SearchConfig {
  enableSemantic?: boolean;
  semanticThreshold?: number;
  keywordWeight?: number;
  semanticWeight?: number;
  maxEmbeddingChars?: number;
}

// ============================================
// Search Service Class
// ============================================

export class SearchService {
  private entryService: EntryService;
  private prisma = getPrismaClient();
  private embeddingService?: EmbeddingService;
  private enableSemantic: boolean;
  private semanticThreshold: number;
  private keywordWeight: number;
  private semanticWeight: number;
  private maxEmbeddingChars: number;

  constructor(
    entryService?: EntryService,
    embeddingService?: EmbeddingService,
    config?: SearchConfig
  ) {
    this.entryService = entryService || getEntryService();
    const env = getConfig();
    const semanticEnabled = config?.enableSemantic ?? (process.env.SEMANTIC_SEARCH_ENABLED !== 'false');
    const hasCustomEmbeddingService = !!embeddingService;
    this.enableSemantic = semanticEnabled && (hasCustomEmbeddingService || !!env.OPENAI_API_KEY);
    const semanticThreshold = parseFloat(process.env.SEMANTIC_SEARCH_THRESHOLD || '0.75');
    const keywordWeight = parseFloat(process.env.KEYWORD_SEARCH_WEIGHT || '0.4');
    const semanticWeight = parseFloat(process.env.SEMANTIC_SEARCH_WEIGHT || '0.6');
    const maxEmbeddingChars = parseInt(process.env.EMBEDDING_MAX_CHARS || '4000', 10);
    this.semanticThreshold = config?.semanticThreshold ?? (Number.isFinite(semanticThreshold) ? semanticThreshold : 0.75);
    this.keywordWeight = config?.keywordWeight ?? (Number.isFinite(keywordWeight) ? keywordWeight : 0.4);
    this.semanticWeight = config?.semanticWeight ?? (Number.isFinite(semanticWeight) ? semanticWeight : 0.6);
    this.maxEmbeddingChars = config?.maxEmbeddingChars ?? (Number.isFinite(maxEmbeddingChars) ? maxEmbeddingChars : 4000);
    this.embeddingService = embeddingService || (this.enableSemantic ? new OpenAIEmbeddingService() : undefined);
  }

  /**
   * Search entries by query
   */
  async search(query: string, options?: SearchOptions): Promise<SearchResult> {
    if (!query || query.trim().length === 0) {
      return { entries: [], total: 0 };
    }

    const userId = requireUserId();
    const trimmedQuery = query.trim();
    const normalizedQuery = trimmedQuery.toLowerCase();
    const category = options?.category;
    const limit = options?.limit;

    const entries = await this.entryService.list(category);

    const scoredHits: Array<{
      hit: SearchHit;
      matchCount: number;
      semanticScore: number;
    }> = [];

    const queryEmbedding = this.enableSemantic
      ? await this.safeEmbed(trimmedQuery)
      : null;

    const prepared = [];
    for (const entrySummary of entries) {
      const fullEntry = await this.entryService.read(entrySummary.path);
      prepared.push({
        summary: entrySummary,
        entry: fullEntry.entry as unknown as Record<string, unknown>,
        content: fullEntry.content || ''
      });
    }

    if (this.enableSemantic && queryEmbedding) {
      for (const item of prepared) {
        const embeddingText = this.buildEmbeddingText(
          item.summary.name,
          item.entry,
          item.content,
          item.summary.category
        );
        await this.ensureEmbedding(item.summary.id, embeddingText);
      }
    }

    const semanticScores = queryEmbedding
      ? await this.fetchSemanticScores(queryEmbedding, userId, category)
      : new Map<string, number>();

    for (const item of prepared) {
      const entrySummary = item.summary;
      const entry = item.entry;
      const content = item.content;

      const matchInfo = this.findBestMatch(
        normalizedQuery,
        entrySummary.name,
        entry,
        content,
        entrySummary.category
      );

      const semanticScore = semanticScores.get(entrySummary.id) || 0;
      const keywordMatchCount = matchInfo?.count || 0;
      const matchesSemantic = this.enableSemantic && semanticScore >= this.semanticThreshold;
      const matchesKeyword = keywordMatchCount > 0;

      if (matchesKeyword || matchesSemantic) {
        const snippetSource = matchInfo?.snippet || this.createSnippet(entrySummary.name || content, normalizedQuery);
        scoredHits.push({
          hit: {
            path: entrySummary.path,
            name: entrySummary.name,
            category: entrySummary.category,
            matchedField: matchInfo?.field || 'semantic',
            snippet: snippetSource,
            highlightRanges: matchInfo?.highlightRanges || [],
            keywordScore: keywordMatchCount,
            semanticScore
          },
          matchCount: keywordMatchCount,
          semanticScore
        });
      }
    }

    const maxMatch = scoredHits.reduce((max, hit) => Math.max(max, hit.matchCount), 0) || 1;
    scoredHits.sort((a, b) => {
      const aKeyword = a.matchCount / maxMatch;
      const bKeyword = b.matchCount / maxMatch;
      const aScore = (this.keywordWeight * aKeyword) + (this.semanticWeight * a.semanticScore);
      const bScore = (this.keywordWeight * bKeyword) + (this.semanticWeight * b.semanticScore);
      return bScore - aScore;
    });

    const limitedHits = limit !== undefined ? scoredHits.slice(0, limit) : scoredHits;

    return {
      entries: limitedHits.map((sh) => ({
        ...sh.hit,
        score: (this.keywordWeight * (sh.matchCount / maxMatch)) + (this.semanticWeight * sh.semanticScore)
      })),
      total: scoredHits.length
    };
  }

  private async fetchSemanticScores(
    queryEmbedding: number[],
    userId: string,
    category?: Category
  ): Promise<Map<string, number>> {
    if (!this.enableSemantic) return new Map();

    const embeddingLiteral = `[${queryEmbedding.join(',')}]`;
    const limit = 200;

    const rows = await this.prisma.$queryRaw<Array<{ entryId: string; score: number }>>(Prisma.sql`
      SELECT e.id as "entryId", (1 - (emb."vector" <=> ${embeddingLiteral}::vector)) as score
      FROM "EntryEmbedding" emb
      JOIN "Entry" e ON e.id = emb."entryId"
      ${category
        ? Prisma.sql`WHERE e."userId" = ${userId} AND e.category = ${category}::"EntryCategory"`
        : Prisma.sql`WHERE e."userId" = ${userId}`}
      ORDER BY emb."vector" <=> ${embeddingLiteral}::vector
      LIMIT ${limit}
    `);

    const scores = new Map<string, number>();
    for (const row of rows) {
      scores.set(row.entryId, Number(row.score));
    }
    return scores;
  }

  private async ensureEmbedding(entryId: string, text: string): Promise<void> {
    if (!this.embeddingService) return;

    const trimmed = text.slice(0, this.maxEmbeddingChars);
    const hash = createHash('sha256').update(trimmed).digest('hex');

    const existing = await this.prisma.entryEmbedding.findUnique({
      where: { entryId },
      select: { hash: true }
    });

    if (existing?.hash === hash) {
      return;
    }

    const vector = await this.safeEmbed(trimmed);
    if (!vector) return;

    const embeddingLiteral = `[${vector.join(',')}]`;
    await this.prisma.$executeRaw(Prisma.sql`
      INSERT INTO "EntryEmbedding" ("entryId", "vector", "hash", "updatedAt")
      VALUES (${entryId}, ${embeddingLiteral}::vector, ${hash}, NOW())
      ON CONFLICT ("entryId") DO UPDATE
      SET "vector" = ${embeddingLiteral}::vector,
          "hash" = ${hash},
          "updatedAt" = NOW()
    `);
  }

  private async safeEmbed(text: string): Promise<number[] | null> {
    if (!this.embeddingService) return null;
    try {
      return await this.embeddingService.embed(text);
    } catch {
      return null;
    }
  }

  private findBestMatch(
    query: string,
    name: string,
    entry: Record<string, unknown>,
    content: string,
    category: Category
  ): MatchInfo | null {
    const matches: MatchInfo[] = [];

    const nameMatches = this.countMatches(name, query);
    if (nameMatches > 0) {
      const snippet = this.createSnippet(name, query);
      matches.push({
        field: 'name',
        count: nameMatches,
        snippet,
        highlightRanges: this.findHighlightRanges(snippet, query)
      });
    }

    if (category === 'ideas' && typeof entry.one_liner === 'string') {
      const oneLinerMatches = this.countMatches(entry.one_liner, query);
      if (oneLinerMatches > 0) {
        const snippet = this.createSnippet(entry.one_liner, query);
        matches.push({
          field: 'one_liner',
          count: oneLinerMatches,
          snippet,
          highlightRanges: this.findHighlightRanges(snippet, query)
        });
      }
    }

    if (category === 'people' && typeof entry.context === 'string') {
      const contextMatches = this.countMatches(entry.context, query);
      if (contextMatches > 0) {
        const snippet = this.createSnippet(entry.context, query);
        matches.push({
          field: 'context',
          count: contextMatches,
          snippet,
          highlightRanges: this.findHighlightRanges(snippet, query)
        });
      }
    }

    if (category === 'projects' && typeof entry.next_action === 'string') {
      const nextActionMatches = this.countMatches(entry.next_action, query);
      if (nextActionMatches > 0) {
        const snippet = this.createSnippet(entry.next_action, query);
        matches.push({
          field: 'next_action',
          count: nextActionMatches,
          snippet,
          highlightRanges: this.findHighlightRanges(snippet, query)
        });
      }
    }

    if (category === 'inbox' && typeof entry.original_text === 'string') {
      const originalMatches = this.countMatches(entry.original_text, query);
      if (originalMatches > 0) {
        const snippet = this.createSnippet(entry.original_text, query);
        matches.push({
          field: 'original_text',
          count: originalMatches,
          snippet,
          highlightRanges: this.findHighlightRanges(snippet, query)
        });
      }
    }

    const contentMatches = this.countMatches(content, query);
    if (contentMatches > 0) {
      const snippet = this.createSnippet(content, query);
      matches.push({
        field: 'content',
        count: contentMatches,
        snippet,
        highlightRanges: this.findHighlightRanges(snippet, query)
      });
    }

    if (matches.length === 0) return null;
    matches.sort((a, b) => b.count - a.count);
    return matches[0];
  }

  private buildEmbeddingText(
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

    return parts.join('\n').slice(0, this.maxEmbeddingChars);
  }

  private countMatches(text: string, query: string): number {
    if (!text || !query) return 0;
    const normalizedText = text.toLowerCase();
    let count = 0;
    let pos = 0;
    while ((pos = normalizedText.indexOf(query, pos)) !== -1) {
      count += 1;
      pos += query.length;
    }
    return count;
  }

  private createSnippet(text: string, query: string): string {
    const normalizedText = text.toLowerCase();
    const matchIndex = normalizedText.indexOf(query);
    if (matchIndex === -1) {
      return text.substring(0, 140);
    }

    const snippetStart = Math.max(0, matchIndex - 50);
    const snippetEnd = Math.min(text.length, matchIndex + query.length + 50);
    let snippet = text.substring(snippetStart, snippetEnd);

    if (snippetStart > 0) snippet = `...${snippet}`;
    if (snippetEnd < text.length) snippet = `${snippet}...`;

    return snippet;
  }

  private findHighlightRanges(snippet: string, query: string): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = [];
    const normalizedSnippet = snippet.toLowerCase();
    const normalizedQuery = query.toLowerCase();
    let pos = 0;
    while ((pos = normalizedSnippet.indexOf(normalizedQuery, pos)) !== -1) {
      ranges.push({ start: pos, end: pos + normalizedQuery.length });
      pos += normalizedQuery.length;
    }
    return ranges;
  }
}

let searchServiceInstance: SearchService | null = null;

export function getSearchService(entryService?: EntryService): SearchService {
  if (!searchServiceInstance || entryService) {
    searchServiceInstance = new SearchService(entryService || undefined);
  }
  return searchServiceInstance;
}

export function resetSearchService(): void {
  searchServiceInstance = null;
}

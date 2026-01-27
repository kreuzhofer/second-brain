/**
 * Property-based tests for Search Service
 * Feature: llm-tool-routing, Property 6: Search Results Filtering and Relevance
 * 
 * **Validates: Requirements 3.7, 7.1, 7.2, 7.3, 7.4**
 * 
 * Tests correctness properties for search filtering and relevance sorting.
 */

import * as fc from 'fast-check';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { SearchService, SearchResult } from '../../src/services/search.service';
import { EntryService } from '../../src/services/entry.service';
import { GitService } from '../../src/services/git.service';
import { IndexService } from '../../src/services/index.service';
import { Category } from '../../src/types/entry.types';

// ============================================
// Test Setup
// ============================================

const TEST_SEARCH_PROP_DIR = join(__dirname, '../.test-search-property-data');

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate a valid category
 */
const categoryArbitrary = fc.constantFrom<Category>('people', 'projects', 'ideas', 'admin', 'inbox');

/**
 * Generate a valid non-inbox category (for creating entries with names)
 */
const nonInboxCategoryArbitrary = fc.constantFrom<Category>('people', 'projects', 'ideas', 'admin');

/**
 * Generate a simple search term (alphanumeric, lowercase)
 */
const searchTermArbitrary = fc.stringMatching(/^[a-z]{3,10}$/);

/**
 * Generate a valid limit value
 */
const limitArbitrary = fc.integer({ min: 1, max: 20 });

// ============================================
// Property Tests for Search Filtering and Relevance
// ============================================

describe('SearchService - Search Filtering and Relevance Properties', () => {
  let searchService: SearchService;
  let entryService: EntryService;
  let gitService: GitService;
  let indexService: IndexService;

  beforeEach(async () => {
    // Clean up and create fresh test directory with category folders
    await rm(TEST_SEARCH_PROP_DIR, { recursive: true, force: true });
    await mkdir(TEST_SEARCH_PROP_DIR, { recursive: true });
    await mkdir(join(TEST_SEARCH_PROP_DIR, 'people'), { recursive: true });
    await mkdir(join(TEST_SEARCH_PROP_DIR, 'projects'), { recursive: true });
    await mkdir(join(TEST_SEARCH_PROP_DIR, 'ideas'), { recursive: true });
    await mkdir(join(TEST_SEARCH_PROP_DIR, 'admin'), { recursive: true });
    await mkdir(join(TEST_SEARCH_PROP_DIR, 'inbox'), { recursive: true });
    
    gitService = new GitService(TEST_SEARCH_PROP_DIR);
    await gitService.initialize();
    
    indexService = new IndexService(TEST_SEARCH_PROP_DIR);
    entryService = new EntryService(TEST_SEARCH_PROP_DIR, gitService, indexService);
    searchService = new SearchService(entryService);
  });

  afterEach(async () => {
    await rm(TEST_SEARCH_PROP_DIR, { recursive: true, force: true });
  });

  /**
   * Property 6: Search Results Filtering and Relevance
   * **Validates: Requirements 3.7, 7.1, 7.2, 7.3, 7.4**
   * 
   * For any search query:
   * - All returned entries SHALL contain the query string in at least one of: name, one_liner, context, or content
   * - If a category filter is provided, all results SHALL be in that category
   * - If a limit is provided, results.length SHALL be at most the limit
   * - Results SHALL be sorted by relevance (entries with more matches appear first)
   */
  describe('Property 6: Search Results Filtering and Relevance', () => {
    
    /**
     * Property 6.1: All returned entries contain the query string
     * **Validates: Requirements 7.1**
     */
    it('should return only entries that contain the query string', async () => {
      // Create test entries with known content
      await entryService.create('people', {
        name: 'Alpha Person',
        context: 'Works on alpha projects',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('projects', {
        name: 'Beta Project',
        next_action: 'Complete beta testing',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('ideas', {
        name: 'Gamma Idea',
        one_liner: 'A gamma ray detector concept',
        source_channel: 'api',
        confidence: 0.9
      });

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('alpha', 'beta', 'gamma'),
          async (query) => {
            const result = await searchService.search(query);
            
            // All returned entries must contain the query
            for (const entry of result.entries) {
              const nameMatch = entry.name.toLowerCase().includes(query);
              const snippetMatch = entry.snippet.toLowerCase().includes(query);
              
              // At least one field must contain the query
              expect(nameMatch || snippetMatch).toBe(true);
            }
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Property 6.2: Category filter restricts results to that category
     * **Validates: Requirements 7.2**
     */
    it('should filter results by category when category filter is provided', async () => {
      // Create entries in different categories with the same search term
      await entryService.create('people', {
        name: 'Test Person',
        context: 'A test person for testing',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('projects', {
        name: 'Test Project',
        next_action: 'Test the project',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('ideas', {
        name: 'Test Idea',
        one_liner: 'A test idea for testing',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('admin', {
        name: 'Test Admin Task',
        status: 'pending',
        source_channel: 'api',
        confidence: 0.9
      });

      await fc.assert(
        fc.asyncProperty(
          nonInboxCategoryArbitrary,
          async (category) => {
            const result = await searchService.search('test', { category });
            
            // All returned entries must be in the specified category
            for (const entry of result.entries) {
              expect(entry.category).toBe(category);
            }
            
            // Should have at least one result since we created entries in each category
            expect(result.entries.length).toBeGreaterThan(0);
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Property 6.3: Limit parameter restricts result count
     * **Validates: Requirements 7.3**
     */
    it('should respect the limit parameter', async () => {
      // Create multiple entries that will match the search
      for (let i = 1; i <= 5; i++) {
        await entryService.create('people', {
          name: `Search Person ${i}`,
          context: `Context for search person ${i}`,
          source_channel: 'api',
          confidence: 0.9
        });
      }

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 4 }),
          async (limit) => {
            const result = await searchService.search('search', { limit });
            
            // Result count must be at most the limit
            expect(result.entries.length).toBeLessThanOrEqual(limit);
            
            // Total should reflect all matches (before limit)
            expect(result.total).toBe(5);
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Property 6.4: Results are sorted by relevance (match count)
     * **Validates: Requirements 7.4**
     */
    it('should sort results by relevance (more matches = higher rank)', async () => {
      // Create entries with varying match counts
      // Entry with many matches
      await entryService.create('ideas', {
        name: 'Match Match Match',
        one_liner: 'This has match match match match in it',
        source_channel: 'api',
        confidence: 0.9
      });
      
      // Entry with few matches
      await entryService.create('people', {
        name: 'Single Match',
        context: 'No other occurrences here',
        source_channel: 'api',
        confidence: 0.9
      });
      
      // Entry with medium matches
      await entryService.create('projects', {
        name: 'Match Project',
        next_action: 'Find another match',
        source_channel: 'api',
        confidence: 0.9
      });

      await fc.assert(
        fc.asyncProperty(
          fc.constant('match'),
          async (query) => {
            const result = await searchService.search(query);
            
            // Should have all 3 entries
            expect(result.entries.length).toBe(3);
            
            // First result should be the one with most matches (ideas entry)
            expect(result.entries[0].category).toBe('ideas');
            
            // Results should be in descending order of relevance
            // We verify this by checking that the first entry has the most matches
            // (the ideas entry has "match" 7 times in name + one_liner)
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Property 6.5: Combined filters work correctly
     * **Validates: Requirements 7.2, 7.3**
     */
    it('should apply both category filter and limit together', async () => {
      // Create multiple entries in the same category
      for (let i = 1; i <= 4; i++) {
        await entryService.create('projects', {
          name: `Combined Project ${i}`,
          next_action: `Action for combined project ${i}`,
          source_channel: 'api',
          confidence: 0.9
        });
      }
      
      // Create entries in other categories
      await entryService.create('people', {
        name: 'Combined Person',
        context: 'A combined test person',
        source_channel: 'api',
        confidence: 0.9
      });

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (limit) => {
            const result = await searchService.search('combined', { 
              category: 'projects', 
              limit 
            });
            
            // All results must be in projects category
            for (const entry of result.entries) {
              expect(entry.category).toBe('projects');
            }
            
            // Result count must be at most the limit
            expect(result.entries.length).toBeLessThanOrEqual(limit);
            
            // Total should reflect all matches in the category (before limit)
            expect(result.total).toBe(4);
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Property 6.6: Empty query returns empty results
     * **Validates: Requirements 7.5**
     */
    it('should return empty results for empty or whitespace queries', async () => {
      await entryService.create('people', {
        name: 'Some Person',
        context: 'Some context',
        source_channel: 'api',
        confidence: 0.9
      });

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('', '   ', '\t', '\n'),
          async (query) => {
            const result = await searchService.search(query);
            
            expect(result.entries).toEqual([]);
            expect(result.total).toBe(0);
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Property 6.7: Non-matching query returns empty results
     * **Validates: Requirements 7.5**
     */
    it('should return empty results when no entries match', async () => {
      await entryService.create('people', {
        name: 'John Doe',
        context: 'A person named John',
        source_channel: 'api',
        confidence: 0.9
      });

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('xyz123', 'nonexistent', 'zzzzz'),
          async (query) => {
            const result = await searchService.search(query);
            
            expect(result.entries).toEqual([]);
            expect(result.total).toBe(0);
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Property 6.8: Case-insensitive search
     * **Validates: Requirements 7.1**
     */
    it('should perform case-insensitive search', async () => {
      await entryService.create('people', {
        name: 'CamelCase Person',
        context: 'Has CamelCase in context',
        source_channel: 'api',
        confidence: 0.9
      });

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('camelcase', 'CAMELCASE', 'CamelCase', 'camelCase'),
          async (query) => {
            const result = await searchService.search(query);
            
            // Should find the entry regardless of case
            expect(result.entries.length).toBe(1);
            expect(result.entries[0].name).toBe('CamelCase Person');
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});

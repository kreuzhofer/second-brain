/**
 * Property-based tests for List Entries Filtering
 * Feature: llm-tool-routing, Property 2: List Entries Filtering
 * 
 * **Validates: Requirements 3.2**
 * 
 * Tests correctness properties for list_entries tool filtering behavior.
 */

import * as fc from 'fast-check';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { ToolExecutor, ListEntriesResult } from '../../src/services/tool-executor';
import { ToolRegistry, getToolRegistry, resetToolRegistry } from '../../src/services/tool-registry';
import { EntryService } from '../../src/services/entry.service';
import { GitService } from '../../src/services/git.service';
import { IndexService } from '../../src/services/index.service';
import { SearchService } from '../../src/services/search.service';
import { DigestService } from '../../src/services/digest.service';
import { Category } from '../../src/types/entry.types';

// ============================================
// Test Setup
// ============================================

const TEST_LIST_ENTRIES_DIR = join(__dirname, '../.test-list-entries-property-data');

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate a valid category (including inbox)
 */
const categoryArbitrary = fc.constantFrom<Category>('people', 'projects', 'ideas', 'admin', 'inbox');

/**
 * Generate a valid non-inbox category (for creating entries with names)
 */
const nonInboxCategoryArbitrary = fc.constantFrom<Category>('people', 'projects', 'ideas', 'admin');

/**
 * Generate a valid status for projects/admin entries
 */
const projectStatusArbitrary = fc.constantFrom('active', 'waiting', 'blocked', 'someday');
const adminStatusArbitrary = fc.constantFrom('pending', 'done');

/**
 * Generate a valid limit value
 */
const limitArbitrary = fc.integer({ min: 1, max: 20 });

// ============================================
// Property Tests for List Entries Filtering
// ============================================

describe('ToolExecutor - List Entries Filtering Properties', () => {
  let toolExecutor: ToolExecutor;
  let toolRegistry: ToolRegistry;
  let entryService: EntryService;
  let gitService: GitService;
  let indexService: IndexService;
  let searchService: SearchService;
  let digestService: DigestService;

  beforeEach(async () => {
    // Clean up and create fresh test directory with category folders
    await rm(TEST_LIST_ENTRIES_DIR, { recursive: true, force: true });
    await mkdir(TEST_LIST_ENTRIES_DIR, { recursive: true });
    await mkdir(join(TEST_LIST_ENTRIES_DIR, 'people'), { recursive: true });
    await mkdir(join(TEST_LIST_ENTRIES_DIR, 'projects'), { recursive: true });
    await mkdir(join(TEST_LIST_ENTRIES_DIR, 'ideas'), { recursive: true });
    await mkdir(join(TEST_LIST_ENTRIES_DIR, 'admin'), { recursive: true });
    await mkdir(join(TEST_LIST_ENTRIES_DIR, 'inbox'), { recursive: true });
    
    gitService = new GitService(TEST_LIST_ENTRIES_DIR);
    await gitService.initialize();
    
    indexService = new IndexService(TEST_LIST_ENTRIES_DIR);
    entryService = new EntryService(TEST_LIST_ENTRIES_DIR, gitService, indexService);
    searchService = new SearchService(entryService);
    // Pass null for services that DigestService doesn't need for this test
    digestService = new DigestService(entryService, indexService, null);
    
    resetToolRegistry();
    toolRegistry = getToolRegistry();
    
    // Create ToolExecutor with all services explicitly provided to avoid default service creation
    toolExecutor = new ToolExecutor(
      toolRegistry,
      entryService,
      undefined, // classificationAgent - not needed for list_entries, but won't trigger default creation
      digestService,
      searchService,
      indexService
    );
  });

  afterEach(async () => {
    await rm(TEST_LIST_ENTRIES_DIR, { recursive: true, force: true });
  });

  /**
   * Property 2: List Entries Filtering
   * **Validates: Requirements 3.2**
   * 
   * For any call to list_entries with a category filter, all returned entries SHALL have 
   * a category matching the filter. For any call with a status filter, all returned entries 
   * SHALL have a status matching the filter. For any call with a limit, the number of 
   * returned entries SHALL be at most the limit value.
   */
  describe('Property 2: List Entries Filtering', () => {
    
    /**
     * Property 2.1: Category filter restricts results to that category
     * **Validates: Requirements 3.2**
     */
    it('should filter results by category when category filter is provided', async () => {
      // Create entries in different categories
      await entryService.create('people', {
        name: 'Test Person',
        context: 'A test person',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('projects', {
        name: 'Test Project',
        status: 'active',
        next_action: 'Test action',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('ideas', {
        name: 'Test Idea',
        one_liner: 'A test idea',
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
            const result = await toolExecutor.execute({
              name: 'list_entries',
              arguments: { category }
            });
            
            expect(result.success).toBe(true);
            const data = result.data as ListEntriesResult;
            
            // All returned entries must be in the specified category
            for (const entry of data.entries) {
              expect(entry.category).toBe(category);
            }
            
            // Should have at least one result since we created entries in each category
            expect(data.entries.length).toBeGreaterThan(0);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 2.2: Status filter restricts results to matching status
     * **Validates: Requirements 3.2**
     */
    it('should filter results by status when status filter is provided', async () => {
      // Create projects with different statuses
      await entryService.create('projects', {
        name: 'Active Project',
        status: 'active',
        next_action: 'Do something',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('projects', {
        name: 'Waiting Project',
        status: 'waiting',
        next_action: 'Wait for response',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('projects', {
        name: 'Blocked Project',
        status: 'blocked',
        next_action: 'Unblock first',
        source_channel: 'api',
        confidence: 0.9
      });

      await fc.assert(
        fc.asyncProperty(
          projectStatusArbitrary,
          async (status) => {
            const result = await toolExecutor.execute({
              name: 'list_entries',
              arguments: { category: 'projects', status }
            });
            
            expect(result.success).toBe(true);
            const data = result.data as ListEntriesResult;
            
            // All returned entries must have the specified status
            for (const entry of data.entries) {
              expect(entry.status).toBe(status);
            }
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 2.3: Limit parameter restricts result count
     * **Validates: Requirements 3.2**
     */
    it('should respect the limit parameter', async () => {
      // Create multiple entries that will be returned
      for (let i = 1; i <= 5; i++) {
        await entryService.create('people', {
          name: `Person ${i}`,
          context: `Context for person ${i}`,
          source_channel: 'api',
          confidence: 0.9
        });
      }

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 4 }),
          async (limit) => {
            const result = await toolExecutor.execute({
              name: 'list_entries',
              arguments: { category: 'people', limit }
            });
            
            expect(result.success).toBe(true);
            const data = result.data as ListEntriesResult;
            
            // Result count must be at most the limit
            expect(data.entries.length).toBeLessThanOrEqual(limit);
            
            // Total should reflect all matches (before limit)
            expect(data.total).toBe(5);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 2.4: Combined category and status filters work correctly
     * **Validates: Requirements 3.2**
     */
    it('should apply both category and status filters together', async () => {
      // Create admin entries with different statuses
      await entryService.create('admin', {
        name: 'Pending Admin Task 1',
        status: 'pending',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('admin', {
        name: 'Pending Admin Task 2',
        status: 'pending',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('admin', {
        name: 'Done Admin Task',
        status: 'done',
        source_channel: 'api',
        confidence: 0.9
      });
      
      // Create project entries (should not appear when filtering admin)
      await entryService.create('projects', {
        name: 'Some Project',
        status: 'active',
        next_action: 'Do something',
        source_channel: 'api',
        confidence: 0.9
      });

      await fc.assert(
        fc.asyncProperty(
          adminStatusArbitrary,
          async (status) => {
            const result = await toolExecutor.execute({
              name: 'list_entries',
              arguments: { category: 'admin', status }
            });
            
            expect(result.success).toBe(true);
            const data = result.data as ListEntriesResult;
            
            // All results must be in admin category with matching status
            for (const entry of data.entries) {
              expect(entry.category).toBe('admin');
              expect(entry.status).toBe(status);
            }
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 2.5: Combined category, status, and limit filters work correctly
     * **Validates: Requirements 3.2**
     */
    it('should apply category, status, and limit filters together', async () => {
      // Create multiple projects with same status
      for (let i = 1; i <= 4; i++) {
        await entryService.create('projects', {
          name: `Active Project ${i}`,
          status: 'active',
          next_action: `Action ${i}`,
          source_channel: 'api',
          confidence: 0.9
        });
      }
      
      // Create projects with different status
      await entryService.create('projects', {
        name: 'Waiting Project',
        status: 'waiting',
        next_action: 'Wait',
        source_channel: 'api',
        confidence: 0.9
      });

      await fc.assert(
        fc.asyncProperty(
          fc.integer({ min: 1, max: 3 }),
          async (limit) => {
            const result = await toolExecutor.execute({
              name: 'list_entries',
              arguments: { category: 'projects', status: 'active', limit }
            });
            
            expect(result.success).toBe(true);
            const data = result.data as ListEntriesResult;
            
            // All results must be projects with active status
            for (const entry of data.entries) {
              expect(entry.category).toBe('projects');
              expect(entry.status).toBe('active');
            }
            
            // Result count must be at most the limit
            expect(data.entries.length).toBeLessThanOrEqual(limit);
            
            // Total should reflect all active projects (before limit)
            expect(data.total).toBe(4);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 2.6: No filters returns entries from all categories
     * **Validates: Requirements 3.2**
     */
    it('should return entries from all categories when no category filter is provided', async () => {
      // Create entries in different categories
      await entryService.create('people', {
        name: 'A Person',
        context: 'Context',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('projects', {
        name: 'A Project',
        status: 'active',
        next_action: 'Action',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('ideas', {
        name: 'An Idea',
        one_liner: 'One liner',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await toolExecutor.execute({
        name: 'list_entries',
        arguments: {}
      });
      
      expect(result.success).toBe(true);
      const data = result.data as ListEntriesResult;
      
      // Should have entries from multiple categories
      const categories = new Set(data.entries.map(e => e.category));
      expect(categories.size).toBeGreaterThanOrEqual(3);
      
      // Total should match entries count (no limit applied)
      expect(data.total).toBe(data.entries.length);
    });

    /**
     * Property 2.7: Default limit is applied when not specified
     * **Validates: Requirements 3.2**
     */
    it('should apply default limit of 10 when limit is not specified', async () => {
      // Create more than 10 entries
      for (let i = 1; i <= 15; i++) {
        await entryService.create('people', {
          name: `Person ${i}`,
          context: `Context ${i}`,
          source_channel: 'api',
          confidence: 0.9
        });
      }

      const result = await toolExecutor.execute({
        name: 'list_entries',
        arguments: { category: 'people' }
      });
      
      expect(result.success).toBe(true);
      const data = result.data as ListEntriesResult;
      
      // Should return at most 10 entries (default limit)
      expect(data.entries.length).toBeLessThanOrEqual(10);
      
      // Total should reflect all entries (before limit)
      expect(data.total).toBe(15);
    });

    /**
     * Property 2.8: Empty result when no entries match filters
     * **Validates: Requirements 3.2**
     */
    it('should return empty results when no entries match the filters', async () => {
      // Create entries that won't match our filter
      await entryService.create('projects', {
        name: 'Active Project',
        status: 'active',
        next_action: 'Do something',
        source_channel: 'api',
        confidence: 0.9
      });

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom('someday', 'blocked'),
          async (status) => {
            const result = await toolExecutor.execute({
              name: 'list_entries',
              arguments: { category: 'projects', status }
            });
            
            expect(result.success).toBe(true);
            const data = result.data as ListEntriesResult;
            
            // Should return empty results
            expect(data.entries).toEqual([]);
            expect(data.total).toBe(0);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

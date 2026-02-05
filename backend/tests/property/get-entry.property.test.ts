/**
 * Property-based tests for Get Entry Round-Trip
 * Feature: llm-tool-routing, Property 3: Get Entry Round-Trip
 * 
 * **Validates: Requirements 3.3**
 * 
 * Tests correctness properties for get_entry tool round-trip behavior.
 */

import * as fc from 'fast-check';
import { resetDatabase } from '../setup';
import { ToolExecutor, GetEntryResult } from '../../src/services/tool-executor';
import { ToolRegistry, getToolRegistry, resetToolRegistry } from '../../src/services/tool-registry';
import { EntryService } from '../../src/services/entry.service';
import { IndexService } from '../../src/services/index.service';
import { SearchService } from '../../src/services/search.service';
import { DigestService } from '../../src/services/digest.service';
import { Category, EntryWithPath } from '../../src/types/entry.types';

// ============================================
// Test Setup
// ============================================

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate a valid non-inbox category (for creating entries with names)
 */
const nonInboxCategoryArbitrary = fc.constantFrom<Category>('people', 'projects', 'ideas', 'admin');

/**
 * Generate a valid entry name (alphanumeric with spaces, reasonable length)
 */
const entryNameArbitrary = fc.tuple(
  fc.string({ minLength: 3, maxLength: 30 })
    .filter(s => /^[a-zA-Z]/.test(s)) // Must start with a letter
    .map(s => s.replace(/[^a-zA-Z0-9 ]/g, '').trim()) // Only alphanumeric and spaces
    .filter(s => s.length >= 3),
  fc.uuid()
).map(([name, id]) => `${name} ${id.slice(0, 8)}`);

/**
 * Generate a valid context/one-liner/next_action string
 */
const contextArbitrary = fc.string({ minLength: 5, maxLength: 100 })
  .map(s => s.replace(/[^\w\s.,!?-]/g, '').trim())
  .filter(s => s.length >= 5);

// ============================================
// Property Tests for Get Entry Round-Trip
// ============================================

describe('ToolExecutor - Get Entry Round-Trip Properties', () => {
  let toolExecutor: ToolExecutor;
  let toolRegistry: ToolRegistry;
  let entryService: EntryService;
  let indexService: IndexService;
  let searchService: SearchService;
  let digestService: DigestService;

  beforeEach(async () => {
    await resetDatabase();
    entryService = new EntryService();
    indexService = new IndexService(entryService);
    searchService = new SearchService(entryService);
    // Pass null for services that DigestService doesn't need for this test
    digestService = new DigestService(entryService, indexService, null);
    
    resetToolRegistry();
    toolRegistry = getToolRegistry();
    
    // Create ToolExecutor with all services explicitly provided to avoid default service creation
    toolExecutor = new ToolExecutor(
      toolRegistry,
      entryService,
      undefined, // classificationAgent - not needed for get_entry
      digestService,
      searchService,
      indexService
    );
  });

  afterEach(async () => {
    await resetDatabase();
  });

  /**
   * Property 3: Get Entry Round-Trip
   * **Validates: Requirements 3.3**
   * 
   * For any valid entry path in the knowledge base, calling get_entry SHALL return 
   * an entry object where the path matches the requested path and the entry data 
   * matches what is stored on disk.
   */
  describe('Property 3: Get Entry Round-Trip', () => {
    
    /**
     * Property 3.1: Path in response matches requested path
     * **Validates: Requirements 3.3**
     */
    it('should return entry with path matching the requested path', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonInboxCategoryArbitrary,
          entryNameArbitrary,
          async (category, name) => {
            // Create an entry with the generated data
            const entryData = createEntryDataForCategory(category, name);
            const createdEntry = await entryService.create(category, entryData);
            
            // Call get_entry via ToolExecutor
            const result = await toolExecutor.execute({
              name: 'get_entry',
              arguments: { path: createdEntry.path }
            });
            
            expect(result.success).toBe(true);
            const data = result.data as GetEntryResult;
            
            // Path in response must match requested path
            expect(data.entry.path).toBe(createdEntry.path);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 3.2: Entry data matches what was created
     * **Validates: Requirements 3.3**
     */
    it('should return entry data matching what was stored on disk', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonInboxCategoryArbitrary,
          entryNameArbitrary,
          contextArbitrary,
          async (category, name, contextOrOneLiner) => {
            // Create an entry with the generated data
            const entryData = createEntryDataForCategory(category, name, contextOrOneLiner);
            const createdEntry = await entryService.create(category, entryData);
            
            // Call get_entry via ToolExecutor
            const result = await toolExecutor.execute({
              name: 'get_entry',
              arguments: { path: createdEntry.path }
            });
            
            expect(result.success).toBe(true);
            const data = result.data as GetEntryResult;
            
            // Entry name must match (cast to any since Entry is a union type)
            expect((data.entry.entry as any).name).toBe(name);
            
            // Category must match
            expect(data.entry.category).toBe(category);
            
            // Category-specific fields must match
            verifyEntryDataForCategory(category, data.entry, entryData);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 3.3: Round-trip preserves all frontmatter fields
     * **Validates: Requirements 3.3**
     */
    it('should preserve all frontmatter fields in round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonInboxCategoryArbitrary,
          entryNameArbitrary,
          async (category, name) => {
            // Create an entry
            const entryData = createEntryDataForCategory(category, name);
            const createdEntry = await entryService.create(category, entryData);
            
            // Call get_entry via ToolExecutor
            const result = await toolExecutor.execute({
              name: 'get_entry',
              arguments: { path: createdEntry.path }
            });
            
            expect(result.success).toBe(true);
            const data = result.data as GetEntryResult;
            
            // Verify essential fields are preserved
            expect(data.entry.entry.id).toBeDefined();
            expect(data.entry.entry.created_at).toBeDefined();
            expect(data.entry.entry.source_channel).toBe('api');
            
            // Verify category-specific required fields exist
            switch (category) {
              case 'people':
                expect((data.entry.entry as any).context).toBeDefined();
                expect((data.entry.entry as any).last_touched).toBeDefined();
                break;
              case 'projects':
                expect((data.entry.entry as any).status).toBeDefined();
                expect((data.entry.entry as any).next_action).toBeDefined();
                break;
              case 'ideas':
                expect((data.entry.entry as any).one_liner).toBeDefined();
                break;
              case 'admin':
                expect((data.entry.entry as any).status).toBeDefined();
                break;
            }
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 3.4: get_entry fails gracefully for non-existent paths
     * **Validates: Requirements 3.3**
     */
    it('should return error for non-existent entry paths', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonInboxCategoryArbitrary,
          fc.string({ minLength: 5, maxLength: 20 })
            .map(s => s.replace(/[^a-z0-9]/g, '-').toLowerCase())
            .filter(s => s.length >= 3),
          async (category, slug) => {
            const nonExistentPath = `${category}/${slug}-nonexistent.md`;
            
            // Call get_entry with non-existent path
            const result = await toolExecutor.execute({
              name: 'get_entry',
              arguments: { path: nonExistentPath }
            });
            
            // Should fail with appropriate error
            expect(result.success).toBe(false);
            expect(result.error).toContain('Entry not found');
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 3.5: Multiple entries can be retrieved independently
     * **Validates: Requirements 3.3**
     */
    it('should retrieve correct entry when multiple entries exist', async () => {
      // Create multiple entries in different categories
      const entries: EntryWithPath[] = [];
      
      const peopleEntry = await entryService.create('people', {
        name: 'Test Person Alpha',
        context: 'A test person for property testing',
        source_channel: 'api',
        confidence: 0.9
      });
      entries.push(peopleEntry);
      
      const projectEntry = await entryService.create('projects', {
        name: 'Test Project Beta',
        status: 'active',
        next_action: 'Complete the test',
        source_channel: 'api',
        confidence: 0.9
      });
      entries.push(projectEntry);
      
      const ideaEntry = await entryService.create('ideas', {
        name: 'Test Idea Gamma',
        one_liner: 'An innovative test idea',
        source_channel: 'api',
        confidence: 0.9
      });
      entries.push(ideaEntry);

      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...entries),
          async (expectedEntry) => {
            // Call get_entry for this specific entry
            const result = await toolExecutor.execute({
              name: 'get_entry',
              arguments: { path: expectedEntry.path }
            });
            
            expect(result.success).toBe(true);
            const data = result.data as GetEntryResult;
            
            // Must return the correct entry
            expect(data.entry.path).toBe(expectedEntry.path);
            expect(data.entry.category).toBe(expectedEntry.category);
            expect((data.entry.entry as any).name).toBe((expectedEntry.entry as any).name);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

// ============================================
// Helper Functions
// ============================================

/**
 * Create entry data for a specific category
 */
function createEntryDataForCategory(category: Category, name: string, contextOrOneLiner?: string): any {
  const baseData = {
    name,
    confidence: 0.9,
    source_channel: 'api' as const
  };

  switch (category) {
    case 'people':
      return {
        ...baseData,
        context: contextOrOneLiner || 'Test context for person',
        follow_ups: [],
        related_projects: []
      };
    case 'projects':
      return {
        ...baseData,
        status: 'active' as const,
        next_action: contextOrOneLiner || 'Test next action',
        related_people: []
      };
    case 'ideas':
      return {
        ...baseData,
        one_liner: contextOrOneLiner || 'Test one liner',
        related_projects: []
      };
    case 'admin':
      return {
        ...baseData,
        status: 'pending' as const
      };
    default:
      return baseData;
  }
}

/**
 * Verify entry data matches for a specific category
 */
function verifyEntryDataForCategory(category: Category, retrievedEntry: EntryWithPath, originalData: any): void {
  const entry = retrievedEntry.entry as any;
  
  switch (category) {
    case 'people':
      expect(entry.context).toBe(originalData.context);
      break;
    case 'projects':
      expect(entry.status).toBe(originalData.status);
      expect(entry.next_action).toBe(originalData.next_action);
      break;
    case 'ideas':
      expect(entry.one_liner).toBe(originalData.one_liner);
      break;
    case 'admin':
      expect(entry.status).toBe(originalData.status);
      break;
  }
}

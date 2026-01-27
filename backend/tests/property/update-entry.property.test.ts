/**
 * Property-based tests for Update Entry Application
 * Feature: llm-tool-routing, Property 4: Update Entry Application
 * 
 * **Validates: Requirements 3.5**
 * 
 * Tests correctness properties for update_entry tool behavior.
 * 
 * Property: For any valid entry path and update object, after calling update_entry,
 * reading the entry SHALL show the updated fields with the new values, while
 * preserving fields not included in the update.
 */

import * as fc from 'fast-check';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { ToolExecutor, GetEntryResult, UpdateEntryResult } from '../../src/services/tool-executor';
import { ToolRegistry, getToolRegistry, resetToolRegistry } from '../../src/services/tool-registry';
import { EntryService } from '../../src/services/entry.service';
import { GitService } from '../../src/services/git.service';
import { IndexService } from '../../src/services/index.service';
import { SearchService } from '../../src/services/search.service';
import { DigestService } from '../../src/services/digest.service';
import { Category, EntryWithPath } from '../../src/types/entry.types';

// ============================================
// Test Setup
// ============================================

const TEST_UPDATE_ENTRY_DIR = join(__dirname, '../.test-update-entry-property-data');

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
const entryNameArbitrary = fc.string({ minLength: 3, maxLength: 30 })
  .filter(s => /^[a-zA-Z]/.test(s)) // Must start with a letter
  .map(s => s.replace(/[^a-zA-Z0-9 ]/g, '').trim()) // Only alphanumeric and spaces
  .filter(s => s.length >= 3); // Ensure minimum length after filtering

/**
 * Generate a valid context/one-liner/next_action string
 */
const contextArbitrary = fc.string({ minLength: 5, maxLength: 100 })
  .map(s => s.replace(/[^\w\s.,!?-]/g, '').trim())
  .filter(s => s.length >= 5);

/**
 * Generate a valid status for projects
 */
const projectStatusArbitrary = fc.constantFrom<'active' | 'waiting' | 'blocked' | 'someday'>(
  'active', 'waiting', 'blocked', 'someday'
);

/**
 * Generate a valid status for admin entries
 */
const adminStatusArbitrary = fc.constantFrom<'pending' | 'done'>('pending', 'done');

/**
 * Generate updates for people entries
 */
const peopleUpdatesArbitrary = fc.record({
  context: contextArbitrary
}, { requiredKeys: [] }).filter(obj => Object.keys(obj).length > 0);

/**
 * Generate updates for projects entries
 */
const projectUpdatesArbitrary = fc.record({
  status: projectStatusArbitrary,
  next_action: contextArbitrary
}, { requiredKeys: [] }).filter(obj => Object.keys(obj).length > 0);

/**
 * Generate updates for ideas entries
 */
const ideaUpdatesArbitrary = fc.record({
  one_liner: contextArbitrary
}, { requiredKeys: [] }).filter(obj => Object.keys(obj).length > 0);

/**
 * Generate updates for admin entries
 */
const adminUpdatesArbitrary = fc.record({
  status: adminStatusArbitrary
}, { requiredKeys: [] }).filter(obj => Object.keys(obj).length > 0);

// ============================================
// Property Tests for Update Entry Application
// ============================================

describe('ToolExecutor - Update Entry Application Properties', () => {
  let toolExecutor: ToolExecutor;
  let toolRegistry: ToolRegistry;
  let entryService: EntryService;
  let gitService: GitService;
  let indexService: IndexService;
  let searchService: SearchService;
  let digestService: DigestService;

  beforeEach(async () => {
    // Clean up and create fresh test directory with category folders
    await rm(TEST_UPDATE_ENTRY_DIR, { recursive: true, force: true });
    await mkdir(TEST_UPDATE_ENTRY_DIR, { recursive: true });
    await mkdir(join(TEST_UPDATE_ENTRY_DIR, 'people'), { recursive: true });
    await mkdir(join(TEST_UPDATE_ENTRY_DIR, 'projects'), { recursive: true });
    await mkdir(join(TEST_UPDATE_ENTRY_DIR, 'ideas'), { recursive: true });
    await mkdir(join(TEST_UPDATE_ENTRY_DIR, 'admin'), { recursive: true });
    await mkdir(join(TEST_UPDATE_ENTRY_DIR, 'inbox'), { recursive: true });
    
    gitService = new GitService(TEST_UPDATE_ENTRY_DIR);
    await gitService.initialize();
    
    indexService = new IndexService(TEST_UPDATE_ENTRY_DIR);
    entryService = new EntryService(TEST_UPDATE_ENTRY_DIR, gitService, indexService);
    searchService = new SearchService(entryService);
    // Pass null for services that DigestService doesn't need for this test
    digestService = new DigestService(entryService, indexService, null);
    
    resetToolRegistry();
    toolRegistry = getToolRegistry();
    
    // Create ToolExecutor with all services explicitly provided
    toolExecutor = new ToolExecutor(
      toolRegistry,
      entryService,
      undefined, // classificationAgent - not needed for update_entry
      digestService,
      searchService,
      indexService
    );
  });

  afterEach(async () => {
    await rm(TEST_UPDATE_ENTRY_DIR, { recursive: true, force: true });
  });

  /**
   * Property 4: Update Entry Application
   * **Validates: Requirements 3.5**
   * 
   * For any valid entry path and update object, after calling update_entry,
   * reading the entry SHALL show the updated fields with the new values,
   * while preserving fields not included in the update.
   */
  describe('Property 4: Update Entry Application', () => {
    
    /**
     * Property 4.1: Updated fields have new values after update
     * **Validates: Requirements 3.5**
     */
    it('should apply updated fields with new values', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonInboxCategoryArbitrary,
          entryNameArbitrary,
          async (category, name) => {
            // Create an entry with initial data
            const entryData = createEntryDataForCategory(category, name);
            const createdEntry = await entryService.create(category, entryData);
            
            // Generate updates appropriate for the category
            const updates = generateUpdatesForCategory(category);
            
            // Call update_entry via ToolExecutor
            const updateResult = await toolExecutor.execute({
              name: 'update_entry',
              arguments: { path: createdEntry.path, updates }
            });
            
            expect(updateResult.success).toBe(true);
            const updateData = updateResult.data as UpdateEntryResult;
            expect(updateData.path).toBe(createdEntry.path);
            
            // Read the entry back using get_entry
            const getResult = await toolExecutor.execute({
              name: 'get_entry',
              arguments: { path: createdEntry.path }
            });
            
            expect(getResult.success).toBe(true);
            const getData = getResult.data as GetEntryResult;
            
            // Verify updated fields have new values
            for (const [key, value] of Object.entries(updates)) {
              expect((getData.entry.entry as any)[key]).toBe(value);
            }
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 4.2: Non-updated fields are preserved after update
     * **Validates: Requirements 3.5**
     */
    it('should preserve fields not included in the update', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonInboxCategoryArbitrary,
          entryNameArbitrary,
          async (category, name) => {
            // Create an entry with initial data
            const entryData = createEntryDataForCategory(category, name);
            const createdEntry = await entryService.create(category, entryData);
            
            // Store original values of fields we won't update
            const originalEntry = createdEntry.entry as any;
            const originalName = originalEntry.name;
            const originalId = originalEntry.id;
            const originalCreatedAt = originalEntry.created_at;
            const originalSourceChannel = originalEntry.source_channel;
            
            // Generate updates appropriate for the category (partial update)
            const updates = generateUpdatesForCategory(category);
            
            // Call update_entry via ToolExecutor
            const updateResult = await toolExecutor.execute({
              name: 'update_entry',
              arguments: { path: createdEntry.path, updates }
            });
            
            expect(updateResult.success).toBe(true);
            
            // Read the entry back using get_entry
            const getResult = await toolExecutor.execute({
              name: 'get_entry',
              arguments: { path: createdEntry.path }
            });
            
            expect(getResult.success).toBe(true);
            const getData = getResult.data as GetEntryResult;
            const updatedEntry = getData.entry.entry as any;
            
            // Verify non-updated fields are preserved
            expect(updatedEntry.name).toBe(originalName);
            expect(updatedEntry.id).toBe(originalId);
            expect(updatedEntry.created_at).toBe(originalCreatedAt);
            expect(updatedEntry.source_channel).toBe(originalSourceChannel);
            
            // Verify category is preserved
            expect(getData.entry.category).toBe(category);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 4.3: Update returns correct list of updated fields
     * **Validates: Requirements 3.5**
     */
    it('should return correct list of updated fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonInboxCategoryArbitrary,
          entryNameArbitrary,
          async (category, name) => {
            // Create an entry with initial data
            const entryData = createEntryDataForCategory(category, name);
            const createdEntry = await entryService.create(category, entryData);
            
            // Generate updates appropriate for the category
            const updates = generateUpdatesForCategory(category);
            
            // Call update_entry via ToolExecutor
            const updateResult = await toolExecutor.execute({
              name: 'update_entry',
              arguments: { path: createdEntry.path, updates }
            });
            
            expect(updateResult.success).toBe(true);
            const updateData = updateResult.data as UpdateEntryResult;
            
            // Verify updatedFields matches the keys we sent
            const expectedFields = Object.keys(updates).sort();
            const actualFields = updateData.updatedFields.sort();
            expect(actualFields).toEqual(expectedFields);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 4.4: Update fails gracefully for non-existent paths
     * **Validates: Requirements 3.5**
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
            
            // Call update_entry with non-existent path
            const result = await toolExecutor.execute({
              name: 'update_entry',
              arguments: { 
                path: nonExistentPath, 
                updates: { status: 'active' } 
              }
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
     * Property 4.5: Multiple sequential updates accumulate correctly
     * **Validates: Requirements 3.5**
     */
    it('should accumulate multiple sequential updates correctly', async () => {
      // Create a project entry (has multiple updatable fields)
      const entryData = createEntryDataForCategory('projects', 'Test Project');
      const createdEntry = await entryService.create('projects', entryData);
      
      // First update: change status
      const firstUpdate = { status: 'waiting' };
      const firstResult = await toolExecutor.execute({
        name: 'update_entry',
        arguments: { path: createdEntry.path, updates: firstUpdate }
      });
      expect(firstResult.success).toBe(true);
      
      // Second update: change next_action
      const secondUpdate = { next_action: 'New action after first update' };
      const secondResult = await toolExecutor.execute({
        name: 'update_entry',
        arguments: { path: createdEntry.path, updates: secondUpdate }
      });
      expect(secondResult.success).toBe(true);
      
      // Read the entry back
      const getResult = await toolExecutor.execute({
        name: 'get_entry',
        arguments: { path: createdEntry.path }
      });
      
      expect(getResult.success).toBe(true);
      const getData = getResult.data as GetEntryResult;
      const finalEntry = getData.entry.entry as any;
      
      // Both updates should be reflected
      expect(finalEntry.status).toBe('waiting');
      expect(finalEntry.next_action).toBe('New action after first update');
      
      // Original name should be preserved
      expect(finalEntry.name).toBe('Test Project');
    });
  });
});

// ============================================
// Helper Functions
// ============================================

/**
 * Create entry data for a specific category
 */
function createEntryDataForCategory(category: Category, name: string): any {
  const baseData = {
    name,
    confidence: 0.9,
    source_channel: 'api' as const
  };

  switch (category) {
    case 'people':
      return {
        ...baseData,
        context: 'Initial context for person',
        follow_ups: [],
        related_projects: []
      };
    case 'projects':
      return {
        ...baseData,
        status: 'active' as const,
        next_action: 'Initial next action',
        related_people: []
      };
    case 'ideas':
      return {
        ...baseData,
        one_liner: 'Initial one liner',
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
 * Generate updates appropriate for a specific category
 */
function generateUpdatesForCategory(category: Category): Record<string, unknown> {
  switch (category) {
    case 'people':
      return { context: 'Updated context for person' };
    case 'projects':
      return { status: 'blocked', next_action: 'Updated next action' };
    case 'ideas':
      return { one_liner: 'Updated one liner' };
    case 'admin':
      return { status: 'done' };
    default:
      return {};
  }
}

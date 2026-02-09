/**
 * Property-based tests for Move Entry Path Change
 * Feature: llm-tool-routing, Property 5: Move Entry Path Change
 * 
 * **Validates: Requirements 3.6**
 * 
 * Tests correctness properties for move_entry tool behavior.
 * 
 * Property: For any valid entry path and target category, after calling move_entry:
 * - The entry SHALL exist at the new path `{targetCategory}/{slug}`
 * - The entry SHALL NOT exist at the original path
 * - The entry's frontmatter SHALL be transformed to match the target category schema
 */

import * as fc from 'fast-check';
import { resetDatabase } from '../setup';
import { ToolExecutor, GetEntryResult, MoveEntryResult } from '../../src/services/tool-executor';
import { ToolRegistry, getToolRegistry, resetToolRegistry } from '../../src/services/tool-registry';
import { EntryService } from '../../src/services/entry.service';
import { IndexService } from '../../src/services/index.service';
import { SearchService } from '../../src/services/search.service';
import { DigestService } from '../../src/services/digest.service';
import { 
  Category,
  CreatePeopleInput,
  CreateProjectsInput,
  CreateIdeasInput,
  CreateAdminInput
} from '../../src/types/entry.types';

// ============================================
// Test Setup
// ============================================

// ============================================
// Test Data Generators
// ============================================

/**
 * Generate a valid non-inbox category (for creating entries with names)
 */
const nonInboxCategoryArbitrary = fc.constantFrom<Category>('people', 'projects', 'ideas', 'task');

/**
 * Generate a valid entry name (alphanumeric with spaces, reasonable length)
 */
const entryNameArbitrary = fc.string({ minLength: 3, maxLength: 30 })
  .filter(s => /^[a-zA-Z]/.test(s)) // Must start with a letter
  .map(s => s.replace(/[^a-zA-Z0-9 ]/g, '').trim()) // Only alphanumeric and spaces
  .filter(s => s.length >= 3); // Ensure minimum length after filtering

/**
 * Generate a pair of different categories (source and target)
 */
const differentCategoriesArbitrary = fc.tuple(
  nonInboxCategoryArbitrary,
  nonInboxCategoryArbitrary
).filter(([source, target]) => source !== target);

/**
 * Category-specific required fields for schema validation
 */
const CATEGORY_REQUIRED_FIELDS: Record<Category, string[]> = {
  people: ['name', 'context', 'follow_ups', 'related_projects', 'last_touched'],
  projects: ['name', 'status', 'next_action', 'related_people'],
  ideas: ['name', 'one_liner', 'related_projects'],
  task: ['name', 'status'],
  admin: ['name', 'status'],
  inbox: ['original_text', 'suggested_category', 'suggested_name', 'status']
};

/**
 * Category-specific valid status values
 */
const CATEGORY_STATUS_VALUES: Record<string, string[]> = {
  projects: ['active', 'waiting', 'blocked', 'someday', 'done'],
  task: ['pending', 'done'],
  admin: ['pending', 'done']
};

// ============================================
// Helper type for accessing entry fields
// ============================================
type AnyEntry = Record<string, unknown>;

// ============================================
// Property Tests for Move Entry Path Change
// ============================================

describe('ToolExecutor - Move Entry Path Change Properties', () => {
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
    
    // Create ToolExecutor with all services explicitly provided
    toolExecutor = new ToolExecutor(
      toolRegistry,
      entryService,
      undefined, // classificationAgent - not needed for move_entry
      digestService,
      searchService,
      indexService
    );
  });

  afterEach(async () => {
    await resetDatabase();
  });

  /**
   * Property 5: Move Entry Path Change
   * **Validates: Requirements 3.6**
   * 
   * For any valid entry path and target category, after calling move_entry:
   * - The entry SHALL exist at the new path `{targetCategory}/{slug}`
   * - The entry SHALL NOT exist at the original path
   * - The entry's frontmatter SHALL be transformed to match the target category schema
   */
  describe('Property 5: Move Entry Path Change', () => {
    
    /**
     * Property 5.1: Entry exists at new path after move
     * **Validates: Requirements 3.6**
     */
    it('should create entry at new path {targetCategory}/{slug}', async () => {
      await fc.assert(
        fc.asyncProperty(
          differentCategoriesArbitrary,
          entryNameArbitrary,
          async ([sourceCategory, targetCategory], name) => {
            await resetDatabase();
            // Create an entry in the source category
            const entryData = createEntryDataForCategory(sourceCategory, name);
            const createdEntry = await entryService.create(sourceCategory, entryData);
            
            // Extract slug from original path
            const originalSlug = createdEntry.path.split('/')[1];
            
            // Call move_entry via ToolExecutor
            const moveResult = await toolExecutor.execute({
              name: 'move_entry',
              arguments: { 
                path: createdEntry.path, 
                targetCategory 
              }
            });
            
            expect(moveResult.success).toBe(true);
            const moveData = moveResult.data as MoveEntryResult;
            
            // Verify new path follows pattern {targetCategory}/{slug}
            expect(moveData.newPath).toBe(`${targetCategory}/${originalSlug}`);
            expect(moveData.category).toBe(targetCategory);
            
            // Verify entry exists at new path using get_entry
            const getResult = await toolExecutor.execute({
              name: 'get_entry',
              arguments: { path: moveData.newPath }
            });
            
            expect(getResult.success).toBe(true);
            const getData = getResult.data as GetEntryResult;
            expect(getData.entry.path).toBe(moveData.newPath);
            expect(getData.entry.category).toBe(targetCategory);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 5.2: Entry does NOT exist at original path after move
     * **Validates: Requirements 3.6**
     */
    it('should remove entry from original path after move', async () => {
      await fc.assert(
        fc.asyncProperty(
          differentCategoriesArbitrary,
          entryNameArbitrary,
          async ([sourceCategory, targetCategory], name) => {
            await resetDatabase();
            // Create an entry in the source category
            const entryData = createEntryDataForCategory(sourceCategory, name);
            const createdEntry = await entryService.create(sourceCategory, entryData);
            const originalPath = createdEntry.path;
            
            // Call move_entry via ToolExecutor
            const moveResult = await toolExecutor.execute({
              name: 'move_entry',
              arguments: { 
                path: originalPath, 
                targetCategory 
              }
            });
            
            expect(moveResult.success).toBe(true);
            
            // Verify entry does NOT exist at original path using get_entry
            const getResult = await toolExecutor.execute({
              name: 'get_entry',
              arguments: { path: originalPath }
            });
            
            expect(getResult.success).toBe(false);
            expect(getResult.error).toContain('Entry not found');
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 5.3: Entry frontmatter is transformed to match target category schema
     * **Validates: Requirements 3.6**
     */
    it('should transform frontmatter to match target category schema', async () => {
      await fc.assert(
        fc.asyncProperty(
          differentCategoriesArbitrary,
          entryNameArbitrary,
          async ([sourceCategory, targetCategory], name) => {
            await resetDatabase();
            // Create an entry in the source category
            const entryData = createEntryDataForCategory(sourceCategory, name);
            const createdEntry = await entryService.create(sourceCategory, entryData);
            
            // Call move_entry via ToolExecutor
            const moveResult = await toolExecutor.execute({
              name: 'move_entry',
              arguments: { 
                path: createdEntry.path, 
                targetCategory 
              }
            });
            
            expect(moveResult.success).toBe(true);
            const moveData = moveResult.data as MoveEntryResult;
            
            // Read the moved entry
            const getResult = await toolExecutor.execute({
              name: 'get_entry',
              arguments: { path: moveData.newPath }
            });
            
            expect(getResult.success).toBe(true);
            const getData = getResult.data as GetEntryResult;
            const movedEntry = getData.entry.entry as unknown as AnyEntry;
            
            // Verify entry has all required fields for target category
            const requiredFields = CATEGORY_REQUIRED_FIELDS[targetCategory];
            for (const field of requiredFields) {
              expect(movedEntry).toHaveProperty(field);
            }
            
            // Verify category-specific field values are valid
            if (targetCategory === 'projects') {
              expect(CATEGORY_STATUS_VALUES.projects).toContain(movedEntry.status);
              expect(movedEntry).toHaveProperty('next_action');
              expect(movedEntry).toHaveProperty('related_people');
              expect(Array.isArray(movedEntry.related_people)).toBe(true);
            } else if (targetCategory === 'admin') {
              expect(CATEGORY_STATUS_VALUES.admin).toContain(movedEntry.status);
            } else if (targetCategory === 'people') {
              expect(movedEntry).toHaveProperty('context');
              expect(movedEntry).toHaveProperty('follow_ups');
              expect(movedEntry).toHaveProperty('related_projects');
              expect(Array.isArray(movedEntry.follow_ups)).toBe(true);
              expect(Array.isArray(movedEntry.related_projects)).toBe(true);
            } else if (targetCategory === 'ideas') {
              expect(movedEntry).toHaveProperty('one_liner');
              expect(movedEntry).toHaveProperty('related_projects');
              expect(Array.isArray(movedEntry.related_projects)).toBe(true);
            }
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 5.4: Common fields (name, tags, confidence, source_channel) are preserved
     * **Validates: Requirements 3.6**
     */
    it('should preserve common fields during move', async () => {
      await fc.assert(
        fc.asyncProperty(
          differentCategoriesArbitrary,
          entryNameArbitrary,
          async ([sourceCategory, targetCategory], name) => {
            await resetDatabase();
            // Create an entry in the source category
            const entryData = createEntryDataForCategory(sourceCategory, name);
            const createdEntry = await entryService.create(sourceCategory, entryData);
            const originalEntry = createdEntry.entry as unknown as AnyEntry;
            
            // Store original common field values
            const originalName = originalEntry.name;
            const originalTags = originalEntry.tags;
            const originalConfidence = originalEntry.confidence;
            const originalSourceChannel = originalEntry.source_channel;
            
            // Call move_entry via ToolExecutor
            const moveResult = await toolExecutor.execute({
              name: 'move_entry',
              arguments: { 
                path: createdEntry.path, 
                targetCategory 
              }
            });
            
            expect(moveResult.success).toBe(true);
            const moveData = moveResult.data as MoveEntryResult;
            
            // Read the moved entry
            const getResult = await toolExecutor.execute({
              name: 'get_entry',
              arguments: { path: moveData.newPath }
            });
            
            expect(getResult.success).toBe(true);
            const getData = getResult.data as GetEntryResult;
            const movedEntry = getData.entry.entry as unknown as AnyEntry;
            
            // Verify common fields are preserved
            expect(movedEntry.name).toBe(originalName);
            expect(movedEntry.tags).toEqual(originalTags);
            expect(movedEntry.confidence).toBe(originalConfidence);
            expect(movedEntry.source_channel).toBe(originalSourceChannel);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 5.5: Move returns correct old and new paths
     * **Validates: Requirements 3.6**
     */
    it('should return correct old and new paths in result', async () => {
      await fc.assert(
        fc.asyncProperty(
          differentCategoriesArbitrary,
          entryNameArbitrary,
          async ([sourceCategory, targetCategory], name) => {
            await resetDatabase();
            // Create an entry in the source category
            const entryData = createEntryDataForCategory(sourceCategory, name);
            const createdEntry = await entryService.create(sourceCategory, entryData);
            const originalPath = createdEntry.path;
            
            // Call move_entry via ToolExecutor
            const moveResult = await toolExecutor.execute({
              name: 'move_entry',
              arguments: { 
                path: originalPath, 
                targetCategory 
              }
            });
            
            expect(moveResult.success).toBe(true);
            const moveData = moveResult.data as MoveEntryResult;
            
            // Verify oldPath matches the original path
            expect(moveData.oldPath).toBe(originalPath);
            
            // Verify newPath starts with target category
            expect(moveData.newPath.startsWith(`${targetCategory}/`)).toBe(true);
            
            // Verify newPath does not end with .md
            expect(moveData.newPath.endsWith('.md')).toBe(false);
            
            // Verify category matches target
            expect(moveData.category).toBe(targetCategory);
            
            return true;
          }
        ),
        { numRuns: 3 }
      );
    });

    /**
     * Property 5.6: Move fails gracefully for non-existent paths
     * **Validates: Requirements 3.6**
     */
    it('should return error for non-existent entry paths', async () => {
      await fc.assert(
        fc.asyncProperty(
          nonInboxCategoryArbitrary,
          nonInboxCategoryArbitrary,
          fc.string({ minLength: 5, maxLength: 20 })
            .map(s => s.replace(/[^a-z0-9]/g, '-').toLowerCase())
            .filter(s => s.length >= 3),
          async (sourceCategory, targetCategory, slug) => {
            await resetDatabase();
            const nonExistentPath = `${sourceCategory}/${slug}-nonexistent`;
            
            // Call move_entry with non-existent path
            const result = await toolExecutor.execute({
              name: 'move_entry',
              arguments: { 
                path: nonExistentPath, 
                targetCategory 
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
     * Property 5.7: Move from inbox transforms suggested_name to name
     * **Validates: Requirements 3.6**
     */
    it('should transform inbox entry suggested_name to name when moving', async () => {
      // Create an inbox entry
      const inboxData = {
        original_text: 'Test thought for inbox',
        suggested_category: 'projects' as Category,
        suggested_name: 'Test Inbox Entry',
        confidence: 0.5,
        source_channel: 'api' as const
      };
      const createdEntry = await entryService.create('inbox', inboxData);
      
      // Move to projects
      const moveResult = await toolExecutor.execute({
        name: 'move_entry',
        arguments: { 
          path: createdEntry.path, 
          targetCategory: 'projects' 
        }
      });
      
      expect(moveResult.success).toBe(true);
      const moveData = moveResult.data as MoveEntryResult;
      
      // Read the moved entry
      const getResult = await toolExecutor.execute({
        name: 'get_entry',
        arguments: { path: moveData.newPath }
      });
      
      expect(getResult.success).toBe(true);
      const getData = getResult.data as GetEntryResult;
      const movedEntry = getData.entry.entry as unknown as AnyEntry;
      
      // Verify suggested_name became name
      expect(movedEntry.name).toBe('Test Inbox Entry');
      
      // Verify it has projects-specific fields
      expect(movedEntry).toHaveProperty('status');
      expect(movedEntry).toHaveProperty('next_action');
      expect(movedEntry).toHaveProperty('related_people');
    });
  });
});

// ============================================
// Helper Functions
// ============================================

/**
 * Create entry data for a specific category
 */
function createEntryDataForCategory(
  category: Category, 
  name: string
): CreatePeopleInput | CreateProjectsInput | CreateIdeasInput | CreateAdminInput {
  const baseData = {
    name,
    confidence: 0.9,
    source_channel: 'api' as const,
    tags: ['test-tag']
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
      // Default to admin for type safety
      return {
        ...baseData,
        status: 'pending' as const
      };
  }
}

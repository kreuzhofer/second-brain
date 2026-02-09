/**
 * Property Tests: Confidence-Based Routing Preservation
 * 
 * Feature: llm-tool-routing, Property 9: Confidence-Based Routing Preservation
 * 
 * *For any* classification result with confidence score C and threshold T (default 0.6):
 * - If C >= T, the entry SHALL be created in the classified category folder
 * - If C < T, the entry SHALL be created in the inbox folder
 * 
 * This property ensures backward compatibility with spec 002's routing behavior.
 * 
 * **Validates: Requirements 8.1**
 */

import * as fc from 'fast-check';
import { ToolExecutor, CaptureResult } from '../../src/services/tool-executor';
import { ToolRegistry, getToolRegistry } from '../../src/services/tool-registry';
import { Category } from '../../src/types/entry.types';
import { ClassificationResult, ContextWindow } from '../../src/types/chat.types';

// ============================================
// Test Configuration
// ============================================

/**
 * Default confidence threshold (matches CONFIDENCE_THRESHOLD in tool-executor.ts)
 */
const CONFIDENCE_THRESHOLD = 0.6;

// ============================================
// Mock Factories
// ============================================

/**
 * Create a mock ClassificationAgent that returns a predictable ClassificationResult
 * with the specified category and confidence
 */
const createMockClassificationAgent = (
  category: 'people' | 'projects' | 'ideas' | 'task',
  confidence: number,
  name: string = 'Test Entry'
) => {
  return {
    classify: jest.fn().mockResolvedValue({
      category,
      confidence,
      name,
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      fields: getCategoryFields(category),
      relatedEntries: [],
      reasoning: 'Test classification',
      bodyContent: ''
    } as ClassificationResult)
  };
};

/**
 * Get default fields for a category
 */
const getCategoryFields = (category: 'people' | 'projects' | 'ideas' | 'task') => {
  switch (category) {
    case 'people':
      return { context: '', followUps: [], relatedProjects: [] };
    case 'projects':
      return { status: 'active', nextAction: '', relatedPeople: [] };
    case 'ideas':
      return { oneLiner: '', relatedProjects: [] };
    case 'task':
      return { status: 'pending' };
  }
};

/**
 * Create a mock EntryService that tracks created entries
 */
const createMockEntryService = () => {
  const createdEntries: Array<{ category: Category; data: unknown }> = [];
  
  return {
    create: jest.fn().mockImplementation(async (category: Category, data: Record<string, unknown>) => {
      createdEntries.push({ category, data });
      const dataObj = data as { name?: string; suggested_name?: string };
      const slug = dataObj.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') 
        || dataObj.suggested_name?.toLowerCase().replace(/[^a-z0-9]+/g, '-')
        || 'test-entry';
      return {
        path: `${category}/${slug}`,
        category,
        entry: { 
          ...data, 
          id: 'test-id', 
          created_at: new Date().toISOString(), 
          updated_at: new Date().toISOString() 
        },
        content: ''
      };
    }),
    read: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
    getCreatedEntries: () => createdEntries
  };
};

/**
 * Create a mock IndexService that returns empty index content
 */
const createMockIndexService = () => {
  return {
    getIndexContent: jest.fn().mockResolvedValue('# Index\n\nEmpty index for testing')
  };
};

/**
 * Create a mock DigestService (not used in this test but required by ToolExecutor)
 */
const createMockDigestService = () => {
  return {
    generateDailyDigest: jest.fn(),
    generateWeeklyReview: jest.fn()
  };
};

/**
 * Create a mock SearchService (not used in this test but required by ToolExecutor)
 */
const createMockSearchService = () => {
  return {
    search: jest.fn()
  };
};

// ============================================
// Test Arbitraries
// ============================================

// Category arbitrary (excluding inbox - classification always returns one of these)
const classifiedCategoryArbitrary = fc.constantFrom( 'people', 'projects', 'ideas', 'task') as fc.Arbitrary<'people' | 'projects' | 'ideas' | 'task'>;

// Entry name arbitrary
const entryNameArbitrary = fc.string({ minLength: 3, maxLength: 30 })
  .filter(s => /[a-zA-Z]/.test(s))
  .map(s => s.replace(/[^a-zA-Z0-9\s]/g, '').trim() || 'Test Entry');

// High confidence score arbitrary (>= 0.6)
// Use Math.fround() to convert to 32-bit floats as required by fast-check
const highConfidenceArbitrary = fc.float({ min: Math.fround(0.6), max: Math.fround(1), noNaN: true });

// Low confidence score arbitrary (< 0.6)
// Use 0.59 to ensure we're safely below 0.6 threshold after float conversion
const lowConfidenceArbitrary = fc.float({ min: Math.fround(0), max: Math.fround(0.59), noNaN: true });

// Any confidence score arbitrary (0.0 to 1.0)
const confidenceArbitrary = fc.float({ min: Math.fround(0), max: Math.fround(1), noNaN: true });

// Text to capture arbitrary
const captureTextArbitrary = fc.string({ minLength: 5, maxLength: 100 })
  .filter(s => /[a-zA-Z]/.test(s))
  .map(s => s.trim() || 'Test thought to capture');

// ============================================
// Property Tests
// ============================================

describe('Property Tests: Confidence-Based Routing Preservation', () => {
  /**
   * Property 9: Confidence-Based Routing Preservation
   * 
   * Feature: llm-tool-routing, Property 9: Confidence-Based Routing Preservation
   * 
   * *For any* classification result with confidence score C and threshold T (default 0.6):
   * - If C >= T, the entry SHALL be created in the classified category folder
   * - If C < T, the entry SHALL be created in the inbox folder
   * 
   * **Validates: Requirements 8.1**
   */
  describe('Property 9: Confidence-Based Routing Preservation', () => {
    it('high confidence (>= 0.6) SHALL route to classified category', async () => {
      await fc.assert(
        fc.asyncProperty(
          classifiedCategoryArbitrary,
          highConfidenceArbitrary,
          entryNameArbitrary,
          captureTextArbitrary,
          async (category, confidence, name, text) => {
            // Create mocks
            const mockClassificationAgent = createMockClassificationAgent(category, confidence, name);
            const mockEntryService = createMockEntryService();
            const mockIndexService = createMockIndexService();
            const mockDigestService = createMockDigestService();
            const mockSearchService = createMockSearchService();
            const toolRegistry = getToolRegistry();

            // Create ToolExecutor with mocks
            const toolExecutor = new ToolExecutor(
              toolRegistry,
              mockEntryService as any,
              mockClassificationAgent as any,
              mockDigestService as any,
              mockSearchService as any,
              mockIndexService as any
            );

            // Execute classify_and_capture tool
            const result = await toolExecutor.execute({
              name: 'classify_and_capture',
              arguments: { text }
            });

            // Verify success
            expect(result.success).toBe(true);
            const captureResult = result.data as CaptureResult;

            // Property: High confidence (>= 0.6) SHALL route to classified category
            expect(captureResult.category).toBe(category);
            expect(captureResult.path).toMatch(new RegExp(`^${category}/`));
            expect(captureResult.clarificationNeeded).toBe(false);

            // Verify entry was created in the correct category
            const createdEntries = mockEntryService.getCreatedEntries();
            expect(createdEntries.length).toBe(1);
            expect(createdEntries[0].category).toBe(category);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('low confidence (< 0.6) SHALL route to inbox', async () => {
      await fc.assert(
        fc.asyncProperty(
          classifiedCategoryArbitrary,
          lowConfidenceArbitrary,
          entryNameArbitrary,
          captureTextArbitrary,
          async (category, confidence, name, text) => {
            // Create mocks
            const mockClassificationAgent = createMockClassificationAgent(category, confidence, name);
            const mockEntryService = createMockEntryService();
            const mockIndexService = createMockIndexService();
            const mockDigestService = createMockDigestService();
            const mockSearchService = createMockSearchService();
            const toolRegistry = getToolRegistry();

            // Create ToolExecutor with mocks
            const toolExecutor = new ToolExecutor(
              toolRegistry,
              mockEntryService as any,
              mockClassificationAgent as any,
              mockDigestService as any,
              mockSearchService as any,
              mockIndexService as any
            );

            // Execute classify_and_capture tool
            const result = await toolExecutor.execute({
              name: 'classify_and_capture',
              arguments: { text }
            });

            // Verify success
            expect(result.success).toBe(true);
            const captureResult = result.data as CaptureResult;

            // Property: Low confidence (< 0.6) SHALL route to inbox
            expect(captureResult.category).toBe('inbox');
            expect(captureResult.path).toMatch(/^inbox\//);
            expect(captureResult.clarificationNeeded).toBe(true);

            // Verify entry was created in inbox
            const createdEntries = mockEntryService.getCreatedEntries();
            expect(createdEntries.length).toBe(1);
            expect(createdEntries[0].category).toBe('inbox');
          }
        ),
        { numRuns: 3 }
      );
    });

    it('confidence exactly at threshold (0.6) SHALL route to classified category', async () => {
      await fc.assert(
        fc.asyncProperty(
          classifiedCategoryArbitrary,
          entryNameArbitrary,
          captureTextArbitrary,
          async (category, name, text) => {
            // Use exactly the threshold value
            const confidence = CONFIDENCE_THRESHOLD;

            // Create mocks
            const mockClassificationAgent = createMockClassificationAgent(category, confidence, name);
            const mockEntryService = createMockEntryService();
            const mockIndexService = createMockIndexService();
            const mockDigestService = createMockDigestService();
            const mockSearchService = createMockSearchService();
            const toolRegistry = getToolRegistry();

            // Create ToolExecutor with mocks
            const toolExecutor = new ToolExecutor(
              toolRegistry,
              mockEntryService as any,
              mockClassificationAgent as any,
              mockDigestService as any,
              mockSearchService as any,
              mockIndexService as any
            );

            // Execute classify_and_capture tool
            const result = await toolExecutor.execute({
              name: 'classify_and_capture',
              arguments: { text }
            });

            // Verify success
            expect(result.success).toBe(true);
            const captureResult = result.data as CaptureResult;

            // Property: Confidence exactly at threshold (0.6) SHALL route to classified category
            // This tests the boundary condition: C >= T means 0.6 >= 0.6 is true
            expect(captureResult.category).toBe(category);
            expect(captureResult.path).toMatch(new RegExp(`^${category}/`));
            expect(captureResult.clarificationNeeded).toBe(false);

            // Verify entry was created in the correct category
            const createdEntries = mockEntryService.getCreatedEntries();
            expect(createdEntries.length).toBe(1);
            expect(createdEntries[0].category).toBe(category);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('routing decision SHALL be consistent for any confidence value', async () => {
      await fc.assert(
        fc.asyncProperty(
          classifiedCategoryArbitrary,
          confidenceArbitrary,
          entryNameArbitrary,
          captureTextArbitrary,
          async (category, confidence, name, text) => {
            // Create mocks
            const mockClassificationAgent = createMockClassificationAgent(category, confidence, name);
            const mockEntryService = createMockEntryService();
            const mockIndexService = createMockIndexService();
            const mockDigestService = createMockDigestService();
            const mockSearchService = createMockSearchService();
            const toolRegistry = getToolRegistry();

            // Create ToolExecutor with mocks
            const toolExecutor = new ToolExecutor(
              toolRegistry,
              mockEntryService as any,
              mockClassificationAgent as any,
              mockDigestService as any,
              mockSearchService as any,
              mockIndexService as any
            );

            // Execute classify_and_capture tool
            const result = await toolExecutor.execute({
              name: 'classify_and_capture',
              arguments: { text }
            });

            // Verify success
            expect(result.success).toBe(true);
            const captureResult = result.data as CaptureResult;

            // Property: Routing decision SHALL follow the threshold rule
            const expectedCategory = confidence >= CONFIDENCE_THRESHOLD ? category : 'inbox';
            const expectedClarificationNeeded = confidence < CONFIDENCE_THRESHOLD;

            expect(captureResult.category).toBe(expectedCategory);
            expect(captureResult.clarificationNeeded).toBe(expectedClarificationNeeded);

            // Verify entry was created in the expected category
            const createdEntries = mockEntryService.getCreatedEntries();
            expect(createdEntries.length).toBe(1);
            expect(createdEntries[0].category).toBe(expectedCategory);
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

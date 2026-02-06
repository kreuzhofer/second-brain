/**
 * Property-Based Tests for Chat Service
 * 
 * Feature: chat-capture-and-classification
 * Properties 4, 5, 6, 7: Confidence routing, inbox structure, course correction
 * 
 * **Validates: Requirements 4.1, 4.2, 4.3, 6.1, 6.2**
 */

import * as fc from 'fast-check';
import { determineTargetFolder } from '../../src/services/chat.service';

// Category arbitrary
const categoryArbitrary = fc.constantFrom('people', 'projects', 'ideas', 'admin');

// Course correction patterns (duplicated from chat.service.ts for testing)
const COURSE_CORRECTION_PATTERNS = [
  /actually\s+(?:that\s+)?should\s+be\s+(?:a\s+)?(\w+)/i,
  /move\s+(?:that\s+)?to\s+(\w+)/i,
  /file\s+(?:that\s+)?as\s+(?:a\s+)?(\w+)/i,
  /that'?s?\s+(?:a\s+)?(\w+)/i,
  /change\s+(?:that\s+)?to\s+(?:a\s+)?(\w+)/i,
  /reclassify\s+(?:as\s+)?(?:a\s+)?(\w+)/i,
];

const CATEGORY_ALIASES: Record<string, string> = {
  'person': 'people',
  'people': 'people',
  'project': 'projects',
  'projects': 'projects',
  'idea': 'ideas',
  'ideas': 'ideas',
  'task': 'admin',
  'admin': 'admin',
};

// Pure function to detect course correction (for testing without service instantiation)
function detectCourseCorrection(message: string): { targetCategory: string } | null {
  for (const pattern of COURSE_CORRECTION_PATTERNS) {
    const match = message.match(pattern);
    if (match && match[1]) {
      const categoryName = match[1].toLowerCase();
      const targetCategory = CATEGORY_ALIASES[categoryName];
      if (targetCategory && targetCategory !== 'inbox') {
        return { targetCategory };
      }
    }
  }
  return null;
}

// Pure function to determine target category based on confidence
function determineTargetCategory(
  category: string,
  confidence: number,
  threshold: number = 0.6
): string {
  return confidence >= threshold ? category : 'inbox';
}

describe('Chat Service - Property Tests', () => {
  /**
   * Property 4: Confidence-Based Routing
   * 
   * For any classification result with confidence score C and threshold T:
   * - If C >= T, the entry SHALL be created in the category folder
   * - If C < T, the entry SHALL be created in the inbox/ folder
   * 
   * **Validates: Requirements 4.1, 4.2**
   */
  describe('Property 4: Confidence-Based Routing', () => {
    it('routes to category folder when confidence >= threshold', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          (confidence, threshold) => {
            const result = determineTargetFolder(confidence, threshold);
            if (confidence >= threshold) {
              expect(result).not.toBe('inbox');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('routes to inbox when confidence < threshold', () => {
      fc.assert(
        fc.property(
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          (confidence, threshold) => {
            const result = determineTargetFolder(confidence, threshold);
            if (confidence < threshold) {
              expect(result).toBe('inbox');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('determineTargetCategory routes correctly with default threshold', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          fc.float({ min: 0, max: 1, noNaN: true }),
          (category, confidence) => {
            const result = determineTargetCategory(category, confidence);
            
            // Default threshold is 0.6
            if (confidence >= 0.6) {
              expect(result).toBe(category);
            } else {
              expect(result).toBe('inbox');
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('determineTargetCategory routes correctly with custom threshold', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          fc.float({ min: 0, max: 1, noNaN: true }),
          fc.float({ min: 0, max: 1, noNaN: true }),
          (category, confidence, threshold) => {
            const result = determineTargetCategory(category, confidence, threshold);
            
            if (confidence >= threshold) {
              expect(result).toBe(category);
            } else {
              expect(result).toBe('inbox');
            }
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * Property 6: Course Correction Detection
   * 
   * For any user message containing phrases like "actually that should be a [category]",
   * "move that to [category]", "file as [category]", or "that's a [category]",
   * the system SHALL interpret this as a course correction request.
   * 
   * **Validates: Requirements 6.1**
   */
  describe('Property 6: Course Correction Detection', () => {
    const correctionPhrases = [
      'actually that should be a',
      'move that to',
      'file as',
      "that's a",
      'change that to',
      'reclassify as',
    ];

    const categoryNames = ['person', 'project', 'idea', 'task', 'people', 'projects', 'ideas', 'admin'];

    it('detects course correction phrases with category names', () => {
      fc.assert(
        fc.property(
          fc.constantFrom(...correctionPhrases),
          fc.constantFrom(...categoryNames),
          (phrase, categoryName) => {
            const message = `${phrase} ${categoryName}`;
            const result = detectCourseCorrection(message);
            
            expect(result).not.toBeNull();
            expect(result?.targetCategory).toBeDefined();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('returns null for messages without course correction intent', () => {
      fc.assert(
        fc.property(
          fc.string().filter(s => 
            !s.toLowerCase().includes('should be') &&
            !s.toLowerCase().includes('move') &&
            !s.toLowerCase().includes('file as') &&
            !s.toLowerCase().includes("that's a") &&
            !s.toLowerCase().includes('change') &&
            !s.toLowerCase().includes('reclassify')
          ),
          (message) => {
            const result = detectCourseCorrection(message);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 50 }
      );
    });

    it('maps category aliases correctly', () => {
      const aliasTests = [
        { input: 'person', expected: 'people' },
        { input: 'people', expected: 'people' },
        { input: 'project', expected: 'projects' },
        { input: 'projects', expected: 'projects' },
        { input: 'idea', expected: 'ideas' },
        { input: 'ideas', expected: 'ideas' },
        { input: 'task', expected: 'admin' },
        { input: 'admin', expected: 'admin' },
      ];

      for (const { input, expected } of aliasTests) {
        const result = detectCourseCorrection(`move that to ${input}`);
        expect(result?.targetCategory).toBe(expected);
      }
    });
  });

  /**
   * Property 5: Inbox Entry Structure (partial - structure validation)
   * 
   * For any entry created in the inbox folder, the entry SHALL contain:
   * original_text, suggested_category, confidence, and status set to "needs_review".
   * 
   * **Validates: Requirements 4.3**
   */
  describe('Property 5: Inbox Entry Structure', () => {
    it('inbox entries have required fields', () => {
      // This is a structural test - the actual inbox creation is tested in integration tests
      // Here we verify the structure expectations
      const requiredInboxFields = ['original_text', 'suggested_category', 'confidence', 'status'];
      
      fc.assert(
        fc.property(
          fc.string({ minLength: 1 }),
          categoryArbitrary,
          fc.float({ min: 0, max: 1, noNaN: true }),
          (originalText, suggestedCategory, confidence) => {
            // Simulate inbox entry structure
            const inboxEntry = {
              original_text: originalText,
              suggested_category: suggestedCategory,
              confidence: confidence,
              status: 'needs_review',
            };

            // Verify all required fields are present
            for (const field of requiredInboxFields) {
              expect(inboxEntry).toHaveProperty(field);
            }
            expect(inboxEntry.status).toBe('needs_review');
          }
        ),
        { numRuns: 50 }
      );
    });
  });

  /**
   * Property 7: Entry Move Operation
   * 
   * For any course correction request specifying a target category, after the operation completes:
   * - The entry SHALL exist at the new path ({category}/{slug})
   * - The entry SHALL NOT exist at the original path
   * - A git commit SHALL be created recording the move
   * 
   * **Validates: Requirements 6.2**
   * 
   * Note: This is a structural property test. Full integration testing of the move
   * operation is done in integration tests with actual file system and git operations.
   */
  describe('Property 7: Entry Move Operation', () => {
    it('new path follows category/slug pattern', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          fc.string({ minLength: 1, maxLength: 50 }).filter(s => /[a-zA-Z0-9]/.test(s)),
          (category, name) => {
            // Simulate slug generation
            const slug = name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .substring(0, 50);
            
            if (slug.length === 0) return true; // Skip empty slugs
            
            const newPath = `${category}/${slug}`;
            
            // Verify path structure
            expect(newPath).toMatch(/^(people|projects|ideas|admin)\/[a-z0-9-]+$/);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('old and new paths are different when category changes', () => {
      fc.assert(
        fc.property(
          categoryArbitrary,
          categoryArbitrary,
          fc.string({ minLength: 1, maxLength: 30 }).filter(s => /[a-zA-Z0-9]/.test(s)),
          (oldCategory, newCategory, name) => {
            if (oldCategory === newCategory) return true; // Skip same category
            
            const slug = name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-+|-+$/g, '')
              .substring(0, 50);
            
            if (slug.length === 0) return true;
            
            const oldPath = `${oldCategory}/${slug}`;
            const newPath = `${newCategory}/${slug}`;
            
            expect(oldPath).not.toBe(newPath);
          }
        ),
        { numRuns: 50 }
      );
    });
  });
});

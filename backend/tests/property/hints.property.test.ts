/**
 * Property-Based Tests for Hint Parsing
 * 
 * Feature: chat-capture-and-classification
 * Property 16: Hint Extraction and Application
 * 
 * **Validates: Requirements 10.1**
 */

import * as fc from 'fast-check';
import {
  parseHints,
  formatHintsForClassifier,
  hasHints,
  extractCategoryHint,
} from '../../src/utils/hints';

// Valid hint types
const VALID_HINT_TYPES = ['project', 'person', 'idea', 'task'] as const;

// Mapping from hint to expected category
const HINT_TO_CATEGORY: Record<string, string> = {
  'project': 'projects',
  'person': 'people',
  'idea': 'ideas',
  'task': 'task',
};

// Arbitrary for generating valid hint types
const hintTypeArbitrary = fc.constantFrom(...VALID_HINT_TYPES);

// Arbitrary for generating entity names (alphanumeric with spaces)
const entityNameArbitrary = fc.stringOf(
  fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 '.split('')),
  { minLength: 1, maxLength: 30 }
).map(s => s.trim()).filter(s => s.length > 0);

// Arbitrary for generating messages without hints
const messageWithoutHintsArbitrary = fc.string()
  .filter(s => !s.includes('[') && !s.includes(']'));

describe('Hint Parsing - Property Tests', () => {
  /**
   * Property 16: Hint Extraction and Application
   * 
   * For any user message containing a category hint in brackets
   * (e.g., "[project]", "[person]", "[idea]", "[task]"), the hint
   * SHALL be extracted and passed to the Classification Agent.
   * 
   * **Validates: Requirements 10.1**
   */
  describe('Property 16: Hint Extraction and Application', () => {
    it('extracts category from simple hints', () => {
      fc.assert(
        fc.property(hintTypeArbitrary, (hintType) => {
          const message = `This is a test [${hintType}] message`;
          const parsed = parseHints(message);
          
          expect(parsed.category).toBe(HINT_TO_CATEGORY[hintType]);
        }),
        { numRuns: 20 }
      );
    });

    it('extracts entity name from hints with colon notation', () => {
      fc.assert(
        fc.property(hintTypeArbitrary, entityNameArbitrary, (hintType, entityName) => {
          const message = `Meeting with [${hintType}:${entityName}]`;
          const parsed = parseHints(message);
          
          expect(parsed.entityLinks.length).toBeGreaterThan(0);
          expect(parsed.entityLinks[0].name).toBe(entityName);
        }),
        { numRuns: 50 }
      );
    });

    it('removes hints from cleaned message', () => {
      fc.assert(
        fc.property(
          hintTypeArbitrary,
          messageWithoutHintsArbitrary,
          messageWithoutHintsArbitrary,
          (hintType, before, after) => {
            const message = `${before} [${hintType}] ${after}`;
            const parsed = parseHints(message);
            
            // Cleaned message should not contain the hint
            expect(parsed.cleanedMessage).not.toContain(`[${hintType}]`);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('preserves message content outside of hints', () => {
      fc.assert(
        fc.property(
          hintTypeArbitrary,
          fc.string({ minLength: 1 }).filter(s => !s.includes('[') && !s.includes(']')),
          (hintType, content) => {
            const message = `${content} [${hintType}]`;
            const parsed = parseHints(message);
            
            // The content should be preserved (possibly with normalized whitespace)
            const normalizedContent = content.replace(/\s+/g, ' ').trim();
            expect(parsed.cleanedMessage).toContain(normalizedContent);
          }
        ),
        { numRuns: 50 }
      );
    });

    it('handles multiple hints (last category wins)', () => {
      fc.assert(
        fc.property(
          hintTypeArbitrary,
          hintTypeArbitrary,
          (firstHint, secondHint) => {
            const message = `[${firstHint}] then [${secondHint}]`;
            const parsed = parseHints(message);
            
            // Last hint determines category
            expect(parsed.category).toBe(HINT_TO_CATEGORY[secondHint]);
            // Both hints should be in rawHints
            expect(parsed.rawHints.length).toBe(2);
          }
        ),
        { numRuns: 20 }
      );
    });

    it('hasHints returns true for messages with hints', () => {
      fc.assert(
        fc.property(hintTypeArbitrary, (hintType) => {
          const message = `Test [${hintType}] message`;
          expect(hasHints(message)).toBe(true);
        }),
        { numRuns: 20 }
      );
    });

    it('hasHints returns false for messages without hints', () => {
      fc.assert(
        fc.property(messageWithoutHintsArbitrary, (message) => {
          expect(hasHints(message)).toBe(false);
        }),
        { numRuns: 50 }
      );
    });

    it('extractCategoryHint returns correct category', () => {
      fc.assert(
        fc.property(hintTypeArbitrary, (hintType) => {
          const message = `[${hintType}] some content`;
          const category = extractCategoryHint(message);
          
          expect(category).toBe(HINT_TO_CATEGORY[hintType]);
        }),
        { numRuns: 20 }
      );
    });

    it('formatHintsForClassifier includes category hint', () => {
      fc.assert(
        fc.property(hintTypeArbitrary, (hintType) => {
          const message = `[${hintType}] content`;
          const parsed = parseHints(message);
          const formatted = formatHintsForClassifier(parsed);
          
          expect(formatted).toContain('Category hint');
          expect(formatted).toContain(HINT_TO_CATEGORY[hintType]);
        }),
        { numRuns: 20 }
      );
    });

    it('formatHintsForClassifier includes entity references', () => {
      fc.assert(
        fc.property(hintTypeArbitrary, entityNameArbitrary, (hintType, entityName) => {
          const message = `[${hintType}:${entityName}]`;
          const parsed = parseHints(message);
          const formatted = formatHintsForClassifier(parsed);
          
          expect(formatted).toContain('reference');
          expect(formatted).toContain(entityName);
        }),
        { numRuns: 50 }
      );
    });
  });

  describe('Edge cases', () => {
    it('handles empty messages', () => {
      const parsed = parseHints('');
      expect(parsed.category).toBeUndefined();
      expect(parsed.entityLinks).toEqual([]);
      expect(parsed.cleanedMessage).toBe('');
    });

    it('handles messages with only whitespace', () => {
      const parsed = parseHints('   ');
      expect(parsed.category).toBeUndefined();
      expect(parsed.cleanedMessage).toBe('');
    });

    it('handles invalid hint types gracefully', () => {
      const parsed = parseHints('[invalid] test');
      expect(parsed.category).toBeUndefined();
      // Invalid hints are not extracted
    });

    it('handles case-insensitive hints', () => {
      const parsed1 = parseHints('[PROJECT] test');
      const parsed2 = parseHints('[Project] test');
      const parsed3 = parseHints('[project] test');
      
      expect(parsed1.category).toBe('projects');
      expect(parsed2.category).toBe('projects');
      expect(parsed3.category).toBe('projects');
    });
  });
});

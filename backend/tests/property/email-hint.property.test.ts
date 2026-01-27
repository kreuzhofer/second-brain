/**
 * Property-Based Tests for Email Subject Hint Extraction
 *
 * Feature: 006-email-channel
 * Property 3: Subject hint extraction
 *
 * **Validates: Requirements 2.2**
 */

import * as fc from 'fast-check';
import { EmailParser, CategoryHint } from '../../src/services/email-parser';

// Valid hint types that can appear in email subjects
const VALID_HINT_TYPES = ['person', 'project', 'idea', 'task'] as const;

// Mapping from hint text to expected category
const HINT_TO_CATEGORY: Record<string, CategoryHint['category']> = {
  person: 'people',
  project: 'projects',
  idea: 'ideas',
  task: 'admin',
};

// Arbitrary for generating valid hint types
const hintTypeArbitrary = fc.constantFrom(...VALID_HINT_TYPES);

// Arbitrary for generating case variations of hint types
const hintTypeCaseVariationArbitrary = hintTypeArbitrary.chain((hint) =>
  fc.constantFrom(
    hint.toLowerCase(),
    hint.toUpperCase(),
    hint.charAt(0).toUpperCase() + hint.slice(1).toLowerCase()
  )
);

// Arbitrary for generating subject text without brackets
const subjectTextArbitrary = fc
  .stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-:'.split('')
    ),
    { minLength: 0, maxLength: 50 }
  )
  .map((s) => s.trim());

// Arbitrary for generating subjects that definitely don't have valid hints at the start
const subjectWithoutHintArbitrary = fc
  .stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-:'.split('')
    ),
    { minLength: 1, maxLength: 50 }
  )
  .filter((s) => !s.match(/^\[(person|project|idea|task)\]/i));

describe('EmailParser - Subject Hint Extraction Property Tests', () => {
  let parser: EmailParser;

  beforeEach(() => {
    parser = new EmailParser();
  });

  /**
   * Property 3: Subject hint extraction
   *
   * For any email subject containing a category hint in bracket notation
   * ([person], [project], [idea], [task]), the Subject_Parser SHALL extract
   * the correct category. For subjects without hints, the parser SHALL return null.
   *
   * **Validates: Requirements 2.2**
   */
  describe('Property 3: Subject hint extraction', () => {
    it('extracts correct category from subjects with valid hints at the start', () => {
      fc.assert(
        fc.property(hintTypeArbitrary, subjectTextArbitrary, (hintType, restOfSubject) => {
          const subject = `[${hintType}] ${restOfSubject}`;
          const result = parser.extractHint(subject);

          expect(result).not.toBeNull();
          expect(result?.category).toBe(HINT_TO_CATEGORY[hintType]);
          expect(result?.originalText).toBe(`[${hintType}] `);
        }),
        { numRuns: 10 }
      );
    });

    it('handles case-insensitive hint extraction', () => {
      fc.assert(
        fc.property(
          hintTypeCaseVariationArbitrary,
          subjectTextArbitrary,
          (hintVariation, restOfSubject) => {
            const subject = `[${hintVariation}] ${restOfSubject}`;
            const result = parser.extractHint(subject);

            // Should extract regardless of case
            expect(result).not.toBeNull();
            // Category should be normalized to lowercase mapping
            const normalizedHint = hintVariation.toLowerCase();
            expect(result?.category).toBe(HINT_TO_CATEGORY[normalizedHint]);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('returns null for subjects without hints', () => {
      fc.assert(
        fc.property(subjectWithoutHintArbitrary, (subject) => {
          const result = parser.extractHint(subject);
          expect(result).toBeNull();
        }),
        { numRuns: 10 }
      );
    });

    it('returns null when hint is not at the start of subject', () => {
      fc.assert(
        fc.property(
          hintTypeArbitrary,
          subjectTextArbitrary.filter((s) => s.length > 0),
          subjectTextArbitrary,
          (hintType, prefix, suffix) => {
            // Hint in the middle of subject should not be extracted
            const subject = `${prefix} [${hintType}] ${suffix}`;
            const result = parser.extractHint(subject);

            expect(result).toBeNull();
          }
        ),
        { numRuns: 10 }
      );
    });

    it('extracts hint without trailing space when subject ends immediately after hint', () => {
      fc.assert(
        fc.property(hintTypeArbitrary, (hintType) => {
          // Subject with just the hint and no trailing content
          const subject = `[${hintType}]`;
          const result = parser.extractHint(subject);

          // The pattern requires trailing space, so this should return null
          // OR if implementation handles this case, it should still extract correctly
          // Based on the HINT_PATTERN = /^\[(person|project|idea|task)\]\s*/i
          // The \s* means zero or more spaces, so it should match
          expect(result).not.toBeNull();
          expect(result?.category).toBe(HINT_TO_CATEGORY[hintType]);
        }),
        { numRuns: 10 }
      );
    });

    it('maps all hint types to their correct categories', () => {
      // Exhaustive test for all hint type mappings
      const mappings: Array<[string, CategoryHint['category']]> = [
        ['person', 'people'],
        ['project', 'projects'],
        ['idea', 'ideas'],
        ['task', 'admin'],
      ];

      for (const [hint, expectedCategory] of mappings) {
        const subject = `[${hint}] Test subject`;
        const result = parser.extractHint(subject);

        expect(result).not.toBeNull();
        expect(result?.category).toBe(expectedCategory);
      }
    });

    it('returns null for invalid hint types in brackets', () => {
      const invalidHints = ['invalid', 'note', 'meeting', 'reminder', 'todo', ''];

      for (const invalidHint of invalidHints) {
        const subject = `[${invalidHint}] Test subject`;
        const result = parser.extractHint(subject);

        expect(result).toBeNull();
      }
    });

    it('returns null for empty subjects', () => {
      const result = parser.extractHint('');
      expect(result).toBeNull();
    });

    it('returns null for whitespace-only subjects', () => {
      fc.assert(
        fc.property(
          fc.stringOf(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 }),
          (whitespace) => {
            const result = parser.extractHint(whitespace);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});

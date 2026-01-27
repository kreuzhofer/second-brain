/**
 * Property-Based Tests for Confirmation Email Content
 *
 * Feature: 006-email-channel
 * Property 7: Confirmation email content based on confidence
 *
 * **Validates: Requirements 5.2, 5.3, 5.5**
 */

import * as fc from 'fast-check';
import {
  ConfirmationSender,
  ConfirmationEntryInfo,
  LOW_CONFIDENCE_THRESHOLD,
} from '../../src/services/confirmation-sender';
import { Category } from '../../src/types/entry.types';

// Valid categories for entries
const VALID_CATEGORIES: Category[] = ['people', 'projects', 'ideas', 'admin', 'inbox'];

// Arbitrary for generating valid category values
const categoryArbitrary = fc.constantFrom(...VALID_CATEGORIES);

// Arbitrary for generating entry names (non-empty strings)
const entryNameArbitrary = fc
  .stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -_'.split('')
    ),
    { minLength: 1, maxLength: 50 }
  )
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

// Arbitrary for generating confidence scores (0 to 1)
const confidenceArbitrary = fc.double({ min: 0, max: 1, noNaN: true });

// Arbitrary for generating low confidence scores (below threshold)
const lowConfidenceArbitrary = fc.double({
  min: 0,
  max: LOW_CONFIDENCE_THRESHOLD - 0.01,
  noNaN: true,
});

// Arbitrary for generating high confidence scores (at or above threshold)
const highConfidenceArbitrary = fc.double({
  min: LOW_CONFIDENCE_THRESHOLD,
  max: 1,
  noNaN: true,
});

// Arbitrary for generating email subjects
const subjectArbitrary = fc
  .stringOf(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-:'.split('')
    ),
    { minLength: 1, maxLength: 100 }
  )
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

// Arbitrary for generating valid 8-character hex thread IDs
const threadIdArbitrary = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
    minLength: 8,
    maxLength: 8,
  })
  .map((chars) => chars.join(''));

// Arbitrary for generating ConfirmationEntryInfo
const entryInfoArbitrary = fc.record({
  name: entryNameArbitrary,
  category: categoryArbitrary,
  confidence: confidenceArbitrary,
});

// Arbitrary for low confidence entry info
const lowConfidenceEntryArbitrary = fc.record({
  name: entryNameArbitrary,
  category: categoryArbitrary,
  confidence: lowConfidenceArbitrary,
});

// Arbitrary for high confidence entry info
const highConfidenceEntryArbitrary = fc.record({
  name: entryNameArbitrary,
  category: categoryArbitrary,
  confidence: highConfidenceArbitrary,
});

describe('ConfirmationSender - Confirmation Email Content Property Tests', () => {
  let sender: ConfirmationSender;

  beforeEach(() => {
    sender = new ConfirmationSender();
  });

  /**
   * Property 7: Confirmation email content based on confidence
   *
   * For any entry created from an inbound email:
   * - The confirmation email SHALL include the entry name, category, and confidence score
   * - IF confidence is below threshold, THEN the confirmation SHALL include clarification instructions
   * - The email SHALL include the correct In-Reply-To header referencing the original email
   *
   * **Validates: Requirements 5.2, 5.3, 5.5**
   */
  describe('Property 7: Confirmation email content based on confidence', () => {
    it('confirmation email always includes entry name, category, and confidence score', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            // Requirement 5.2: Include entry name, category, and confidence score
            expect(result.body).toContain(entry.name);
            expect(result.body).toContain(entry.category);

            // Confidence should be displayed as percentage
            const confidencePercent = Math.round(entry.confidence * 100);
            expect(result.body).toContain(`${confidencePercent}%`);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('low confidence entries include clarification instructions', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          lowConfidenceEntryArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            // Requirement 5.5: Include clarification instructions for low-confidence entries
            expect(result.body).toContain('routed to your inbox');
            expect(result.body).toContain('reclassify');
            // Should mention category hints
            expect(result.body).toMatch(/\[person\]|\[project\]|\[idea\]|\[task\]/);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('high confidence entries do NOT include clarification instructions', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          highConfidenceEntryArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            // High confidence entries should not have inbox routing message
            expect(result.body).not.toContain('routed to your inbox');
            expect(result.body).not.toContain('reclassify');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('confirmation email subject includes thread ID in correct format', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            // Requirement 5.4: Subject includes thread identifier
            const expectedThreadIdFormat = `[SB-${threadId}]`;
            expect(result.subject).toContain(expectedThreadIdFormat);

            // Subject should be a reply (Re: prefix)
            expect(result.subject).toMatch(/^Re:/);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('confirmation email body footer includes thread ID', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            // Requirement 5.4: Thread ID in body footer
            const expectedThreadIdFormat = `[SB-${threadId}]`;
            expect(result.body).toContain(`Thread ID: ${expectedThreadIdFormat}`);

            // Should include reply instructions
            expect(result.body).toContain('Reply to this email');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('thread ID appears in both subject and body for any entry', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            const expectedThreadIdFormat = `[SB-${threadId}]`;

            // Thread ID must appear in both locations
            // Requirement 3.2, 5.4: Thread ID in subject and body footer
            expect(result.subject).toContain(expectedThreadIdFormat);
            expect(result.body).toContain(expectedThreadIdFormat);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('confidence threshold boundary: exactly at threshold is high confidence', () => {
      fc.assert(
        fc.property(subjectArbitrary, threadIdArbitrary, entryNameArbitrary, categoryArbitrary, (
          originalSubject,
          threadId,
          name,
          category
        ) => {
          // Entry with confidence exactly at threshold
          const entry: ConfirmationEntryInfo = {
            name,
            category,
            confidence: LOW_CONFIDENCE_THRESHOLD,
          };

          const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

          // At threshold should NOT include clarification instructions
          expect(result.body).not.toContain('routed to your inbox');
        }),
        { numRuns: 10 }
      );
    });

    it('original subject is preserved in reply subject', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            // Original subject should be included in the reply subject
            expect(result.subject).toContain(originalSubject);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('confirmation body starts with success message', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            // Should start with a confirmation message
            expect(result.body).toMatch(/^Your thought has been captured/);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});

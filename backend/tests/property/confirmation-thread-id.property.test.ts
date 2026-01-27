/**
 * Property-Based Tests for Thread ID Presence in Confirmation Emails
 *
 * Feature: 006-email-channel
 * Property 5: Thread ID presence in confirmation emails
 *
 * For any confirmation email sent in response to an inbound email,
 * the thread identifier SHALL appear in both the subject line and
 * the email body footer.
 *
 * **Validates: Requirements 3.2, 5.4**
 */

import * as fc from 'fast-check';
import {
  ConfirmationSender,
  ConfirmationEntryInfo,
} from '../../src/services/confirmation-sender';
import { Category } from '../../src/types/entry.types';

// ============================================
// Arbitraries
// ============================================

// Valid categories for entries
const VALID_CATEGORIES: Category[] = ['people', 'projects', 'ideas', 'admin', 'inbox'];

// Arbitrary for generating valid category values
const categoryArbitrary = fc.constantFrom(...VALID_CATEGORIES);

// Arbitrary for generating entry names (non-empty strings)
const entryNameArbitrary = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim());

// Arbitrary for generating confidence scores (0 to 1)
const confidenceArbitrary = fc.double({ min: 0, max: 1, noNaN: true });

// Arbitrary for generating email subjects (non-empty, printable)
const subjectArbitrary = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0)
  .map((s) => s.trim());

// Arbitrary for generating valid 8-character hex thread IDs
const threadIdArbitrary = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
    minLength: 8,
    maxLength: 8,
  })
  .map((chars) => chars.join(''));

// Arbitrary for generating ConfirmationEntryInfo
const entryInfoArbitrary: fc.Arbitrary<ConfirmationEntryInfo> = fc.record({
  name: entryNameArbitrary,
  category: categoryArbitrary,
  confidence: confidenceArbitrary,
});

// ============================================
// Property Tests
// ============================================

describe('ConfirmationSender - Thread ID Presence Property Tests', () => {
  let sender: ConfirmationSender;

  beforeEach(() => {
    sender = new ConfirmationSender();
  });

  /**
   * Property 5: Thread ID presence in confirmation emails
   *
   * For any confirmation email sent in response to an inbound email,
   * the thread identifier SHALL appear in both the subject line and
   * the email body footer.
   *
   * Thread ID format: [SB-{8 hex characters}]
   *
   * **Validates: Requirements 3.2, 5.4**
   */
  describe('Property 5: Thread ID presence in confirmation emails', () => {
    // Regex pattern for thread ID format in emails
    const THREAD_ID_PATTERN = /\[SB-[a-f0-9]{8}\]/;

    it('thread ID appears in subject line for any confirmation email', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            // Requirement 3.2, 5.4: Thread ID must appear in subject
            const expectedThreadId = `[SB-${threadId}]`;
            expect(result.subject).toContain(expectedThreadId);

            // Verify it matches the expected format
            expect(result.subject).toMatch(THREAD_ID_PATTERN);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('thread ID appears in body footer for any confirmation email', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            // Requirement 3.2, 5.4: Thread ID must appear in body footer
            const expectedThreadId = `[SB-${threadId}]`;
            expect(result.body).toContain(expectedThreadId);

            // Verify it matches the expected format
            expect(result.body).toMatch(THREAD_ID_PATTERN);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('thread ID appears in BOTH subject AND body for any confirmation email', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            const expectedThreadId = `[SB-${threadId}]`;

            // Requirement 3.2, 5.4: Thread ID must appear in BOTH locations
            // This is the core property being tested
            const subjectHasThreadId = result.subject.includes(expectedThreadId);
            const bodyHasThreadId = result.body.includes(expectedThreadId);

            expect(subjectHasThreadId).toBe(true);
            expect(bodyHasThreadId).toBe(true);
            expect(subjectHasThreadId && bodyHasThreadId).toBe(true);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('thread ID in body is labeled as "Thread ID:" for identification', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            const expectedThreadId = `[SB-${threadId}]`;

            // Body should have labeled thread ID for easy identification
            expect(result.body).toContain(`Thread ID: ${expectedThreadId}`);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('same thread ID value appears in both subject and body', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            // Extract thread IDs from both locations
            const subjectMatch = result.subject.match(/\[SB-([a-f0-9]{8})\]/);
            const bodyMatch = result.body.match(/\[SB-([a-f0-9]{8})\]/);

            // Both must be present
            expect(subjectMatch).not.toBeNull();
            expect(bodyMatch).not.toBeNull();

            // Both must contain the same thread ID value
            expect(subjectMatch![1]).toBe(threadId);
            expect(bodyMatch![1]).toBe(threadId);
            expect(subjectMatch![1]).toBe(bodyMatch![1]);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('thread ID presence is independent of entry confidence level', () => {
      // Test with low confidence
      const lowConfidenceArbitrary = fc.double({
        min: 0,
        max: 0.69,
        noNaN: true,
      });

      // Test with high confidence
      const highConfidenceArbitrary = fc.double({
        min: 0.7,
        max: 1,
        noNaN: true,
      });

      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryNameArbitrary,
          categoryArbitrary,
          lowConfidenceArbitrary,
          highConfidenceArbitrary,
          (originalSubject, threadId, name, category, lowConf, highConf) => {
            const expectedThreadId = `[SB-${threadId}]`;

            // Test low confidence entry
            const lowConfEntry: ConfirmationEntryInfo = {
              name,
              category,
              confidence: lowConf,
            };
            const lowConfResult = sender.formatConfirmationEmail(
              originalSubject,
              threadId,
              lowConfEntry
            );

            // Test high confidence entry
            const highConfEntry: ConfirmationEntryInfo = {
              name,
              category,
              confidence: highConf,
            };
            const highConfResult = sender.formatConfirmationEmail(
              originalSubject,
              threadId,
              highConfEntry
            );

            // Thread ID must appear in both subject and body regardless of confidence
            expect(lowConfResult.subject).toContain(expectedThreadId);
            expect(lowConfResult.body).toContain(expectedThreadId);
            expect(highConfResult.subject).toContain(expectedThreadId);
            expect(highConfResult.body).toContain(expectedThreadId);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('thread ID presence is independent of entry category', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryNameArbitrary,
          confidenceArbitrary,
          (originalSubject, threadId, name, confidence) => {
            const expectedThreadId = `[SB-${threadId}]`;

            // Test all categories
            for (const category of VALID_CATEGORIES) {
              const entry: ConfirmationEntryInfo = { name, category, confidence };
              const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

              // Thread ID must appear in both locations for all categories
              expect(result.subject).toContain(expectedThreadId);
              expect(result.body).toContain(expectedThreadId);
            }
          }
        ),
        { numRuns: 10 }
      );
    });

    it('thread ID format is consistent [SB-{8 hex chars}]', () => {
      fc.assert(
        fc.property(
          subjectArbitrary,
          threadIdArbitrary,
          entryInfoArbitrary,
          (originalSubject, threadId, entry) => {
            const result = sender.formatConfirmationEmail(originalSubject, threadId, entry);

            // Extract all thread ID occurrences from subject and body
            const allMatches = [
              ...result.subject.matchAll(/\[SB-([a-f0-9]{8})\]/g),
              ...result.body.matchAll(/\[SB-([a-f0-9]{8})\]/g),
            ];

            // Should have at least 2 occurrences (one in subject, one in body)
            expect(allMatches.length).toBeGreaterThanOrEqual(2);

            // All occurrences should have the same thread ID
            for (const match of allMatches) {
              expect(match[1]).toBe(threadId);
            }
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});

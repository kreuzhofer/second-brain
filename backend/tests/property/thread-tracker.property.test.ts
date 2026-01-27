/**
 * Property-Based Tests for Thread Tracker
 *
 * Feature: 006-email-channel
 * Property 4: Thread ID format consistency
 *
 * **Validates: Requirements 3.1**
 */

import * as fc from 'fast-check';
import { ThreadTracker } from '../../src/services/thread-tracker';

describe('ThreadTracker - Thread ID Format Property Tests', () => {
  let tracker: ThreadTracker;

  beforeEach(() => {
    tracker = new ThreadTracker();
  });

  /**
   * Property 4: Thread ID format consistency
   *
   * For any generated thread identifier, it SHALL match the format
   * `[SB-{8 hex characters}]` and be unique across multiple generations.
   *
   * **Validates: Requirements 3.1**
   */
  describe('Property 4: Thread ID format consistency', () => {
    // Regex pattern for valid thread ID: exactly 8 lowercase hex characters
    const THREAD_ID_PATTERN = /^[a-f0-9]{8}$/;
    // Regex pattern for formatted thread ID: [SB-{8 hex chars}]
    const FORMATTED_THREAD_ID_PATTERN = /^\[SB-[a-f0-9]{8}\]$/;

    it('generateThreadId() always produces 8 hex character strings', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const threadId = tracker.generateThreadId();

          // Must be exactly 8 characters
          expect(threadId).toHaveLength(8);

          // Must match hex pattern (lowercase)
          expect(threadId).toMatch(THREAD_ID_PATTERN);
        }),
        { numRuns: 10 }
      );
    });

    it('formatThreadId() always produces [SB-{threadId}] format', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const threadId = tracker.generateThreadId();
          const formatted = tracker.formatThreadId(threadId);

          // Must match the full format pattern
          expect(formatted).toMatch(FORMATTED_THREAD_ID_PATTERN);

          // Must contain the original thread ID
          expect(formatted).toBe(`[SB-${threadId}]`);
        }),
        { numRuns: 10 }
      );
    });

    it('generated thread IDs are unique across multiple generations', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          // Generate multiple thread IDs
          const threadIds = new Set<string>();
          const numGenerations = 100;

          for (let i = 0; i < numGenerations; i++) {
            const threadId = tracker.generateThreadId();
            threadIds.add(threadId);
          }

          // All generated IDs should be unique
          expect(threadIds.size).toBe(numGenerations);
        }),
        { numRuns: 10 }
      );
    });

    it('formatThreadId() correctly formats any valid 8-hex-char input', () => {
      // Arbitrary for generating valid 8-character hex strings
      const hexStringArbitrary = fc
        .array(fc.constantFrom(...'0123456789abcdef'.split('')), {
          minLength: 8,
          maxLength: 8,
        })
        .map((chars) => chars.join(''));

      fc.assert(
        fc.property(hexStringArbitrary, (hex) => {
          const formatted = tracker.formatThreadId(hex);

          // Must match the full format pattern
          expect(formatted).toMatch(FORMATTED_THREAD_ID_PATTERN);

          // Must wrap the input correctly
          expect(formatted).toBe(`[SB-${hex}]`);
        }),
        { numRuns: 10 }
      );
    });

    it('thread IDs contain only valid hex characters (0-9, a-f)', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const threadId = tracker.generateThreadId();

          // Each character must be a valid hex digit
          for (const char of threadId) {
            expect('0123456789abcdef').toContain(char);
          }
        }),
        { numRuns: 10 }
      );
    });

    it('thread IDs are always lowercase', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const threadId = tracker.generateThreadId();

          // Should be equal to its lowercase version
          expect(threadId).toBe(threadId.toLowerCase());

          // Should not contain any uppercase letters
          expect(threadId).not.toMatch(/[A-F]/);
        }),
        { numRuns: 10 }
      );
    });

    it('formatted thread ID can be parsed back to extract the original ID', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          const threadId = tracker.generateThreadId();
          const formatted = tracker.formatThreadId(threadId);

          // Extract thread ID using the same pattern used in EmailParser
          const extractPattern = /\[SB-([a-f0-9]{8})\]/i;
          const match = formatted.match(extractPattern);

          expect(match).not.toBeNull();
          expect(match![1].toLowerCase()).toBe(threadId);
        }),
        { numRuns: 10 }
      );
    });

    it('multiple ThreadTracker instances generate unique IDs', () => {
      fc.assert(
        fc.property(fc.constant(null), () => {
          // Create multiple tracker instances
          const tracker1 = new ThreadTracker();
          const tracker2 = new ThreadTracker();

          const threadIds = new Set<string>();
          const numPerTracker = 50;

          // Generate IDs from both trackers
          for (let i = 0; i < numPerTracker; i++) {
            threadIds.add(tracker1.generateThreadId());
            threadIds.add(tracker2.generateThreadId());
          }

          // All IDs should be unique across both trackers
          expect(threadIds.size).toBe(numPerTracker * 2);
        }),
        { numRuns: 10 }
      );
    });
  });
});

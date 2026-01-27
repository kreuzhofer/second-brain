/**
 * Property-Based Tests for Email Thread ID Extraction
 *
 * Feature: 006-email-channel
 * Property 6: Thread ID extraction with fallback
 *
 * **Validates: Requirements 3.3, 3.4**
 */

import * as fc from 'fast-check';
import { EmailParser } from '../../src/services/email-parser';

// Thread ID format: [SB-{8 hex characters}]
// Pattern: /\[SB-([a-f0-9]{8})\]/i

// Arbitrary for generating valid 8-character hex strings
const hexStringArbitrary = fc
  .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 8, maxLength: 8 })
  .map((chars) => chars.join(''));

// Arbitrary for generating case variations of hex strings
const hexStringCaseVariationArbitrary = hexStringArbitrary.chain((hex) =>
  fc.constantFrom(hex.toLowerCase(), hex.toUpperCase(), mixCase(hex))
);

// Helper to create mixed case version
function mixCase(str: string): string {
  return str
    .split('')
    .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
    .join('');
}

// Arbitrary for generating valid thread ID format [SB-{hex}]
const threadIdArbitrary = hexStringArbitrary.map((hex) => `[SB-${hex}]`);

// Arbitrary for generating thread ID with case variations
const threadIdCaseVariationArbitrary = hexStringCaseVariationArbitrary.chain((hex) =>
  fc.constantFrom(`[SB-${hex}]`, `[sb-${hex}]`, `[Sb-${hex}]`)
);

// Arbitrary for generating text without thread IDs
const textWithoutThreadIdArbitrary = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?\n-:'.split('')), {
    minLength: 0,
    maxLength: 100,
  })
  .map((chars) => chars.join(''))
  .filter((s) => !s.match(/\[SB-[a-f0-9]{8}\]/i));

// Arbitrary for generating subject text (single line, no thread ID)
const subjectTextArbitrary = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-:'.split('')), {
    minLength: 0,
    maxLength: 50,
  })
  .map((chars) => chars.join(''))
  .filter((s) => !s.match(/\[SB-[a-f0-9]{8}\]/i));

// Arbitrary for generating body text (multi-line, no thread ID)
const bodyTextArbitrary = fc
  .array(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?\n-:'.split('')), {
    minLength: 0,
    maxLength: 200,
  })
  .map((chars) => chars.join(''))
  .filter((s) => !s.match(/\[SB-[a-f0-9]{8}\]/i));

describe('EmailParser - Thread ID Extraction Property Tests', () => {
  let parser: EmailParser;

  beforeEach(() => {
    parser = new EmailParser();
  });

  /**
   * Property 6: Thread ID extraction with fallback
   *
   * For any email where the thread ID is present only in the body (not in subject),
   * the Thread_Tracker SHALL successfully extract the thread ID from the body.
   *
   * **Validates: Requirements 3.3, 3.4**
   */
  describe('Property 6: Thread ID extraction with fallback', () => {
    it('extracts thread ID from subject when present only in subject', () => {
      fc.assert(
        fc.property(
          hexStringArbitrary,
          subjectTextArbitrary,
          bodyTextArbitrary,
          (hex, subjectPrefix, body) => {
            const subject = `${subjectPrefix} [SB-${hex}]`;
            const result = parser.extractThreadId(subject, body);

            expect(result).not.toBeNull();
            expect(result).toBe(hex.toLowerCase());
          }
        ),
        { numRuns: 10 }
      );
    });

    it('extracts thread ID from body when present only in body (fallback)', () => {
      fc.assert(
        fc.property(
          hexStringArbitrary,
          subjectTextArbitrary,
          bodyTextArbitrary,
          (hex, subject, bodyPrefix) => {
            // Thread ID only in body, not in subject
            const body = `${bodyPrefix}\n\nThread ID: [SB-${hex}]`;
            const result = parser.extractThreadId(subject, body);

            expect(result).not.toBeNull();
            expect(result).toBe(hex.toLowerCase());
          }
        ),
        { numRuns: 10 }
      );
    });

    it('extracts thread ID from subject when present in both (subject takes precedence)', () => {
      fc.assert(
        fc.property(
          hexStringArbitrary,
          hexStringArbitrary,
          subjectTextArbitrary,
          bodyTextArbitrary,
          (subjectHex, bodyHex, subjectPrefix, bodyPrefix) => {
            // Different thread IDs in subject and body
            const subject = `${subjectPrefix} [SB-${subjectHex}]`;
            const body = `${bodyPrefix}\n\nThread ID: [SB-${bodyHex}]`;
            const result = parser.extractThreadId(subject, body);

            // Subject should take precedence
            expect(result).not.toBeNull();
            expect(result).toBe(subjectHex.toLowerCase());
          }
        ),
        { numRuns: 10 }
      );
    });

    it('returns null when no thread ID is present', () => {
      fc.assert(
        fc.property(subjectTextArbitrary, bodyTextArbitrary, (subject, body) => {
          const result = parser.extractThreadId(subject, body);
          expect(result).toBeNull();
        }),
        { numRuns: 10 }
      );
    });

    it('handles case-insensitive thread ID extraction', () => {
      fc.assert(
        fc.property(
          threadIdCaseVariationArbitrary,
          subjectTextArbitrary,
          bodyTextArbitrary,
          (threadId, subjectPrefix, body) => {
            const subject = `${subjectPrefix} ${threadId}`;
            const result = parser.extractThreadId(subject, body);

            // Should extract regardless of case
            expect(result).not.toBeNull();
            // Result should be normalized to lowercase
            expect(result).toMatch(/^[a-f0-9]{8}$/);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('extracts thread ID from anywhere in the body', () => {
      fc.assert(
        fc.property(
          hexStringArbitrary,
          subjectTextArbitrary,
          bodyTextArbitrary,
          bodyTextArbitrary,
          (hex, subject, bodyBefore, bodyAfter) => {
            // Thread ID in the middle of body
            const body = `${bodyBefore}\n[SB-${hex}]\n${bodyAfter}`;
            const result = parser.extractThreadId(subject, body);

            expect(result).not.toBeNull();
            expect(result).toBe(hex.toLowerCase());
          }
        ),
        { numRuns: 10 }
      );
    });

    it('extracts thread ID from anywhere in the subject', () => {
      fc.assert(
        fc.property(
          hexStringArbitrary,
          subjectTextArbitrary,
          subjectTextArbitrary,
          bodyTextArbitrary,
          (hex, subjectBefore, subjectAfter, body) => {
            // Thread ID in the middle of subject
            const subject = `${subjectBefore} [SB-${hex}] ${subjectAfter}`;
            const result = parser.extractThreadId(subject, body);

            expect(result).not.toBeNull();
            expect(result).toBe(hex.toLowerCase());
          }
        ),
        { numRuns: 10 }
      );
    });

    it('returns null for invalid thread ID formats', () => {
      // Test various invalid formats
      const invalidFormats = [
        '[SB-1234567]', // 7 chars (too short)
        '[SB-123456789]', // 9 chars (too long)
        '[SB-1234567g]', // invalid hex char
        '[SB-12345678', // missing closing bracket
        'SB-12345678]', // missing opening bracket
        '[sb12345678]', // missing dash
        '[SB_12345678]', // underscore instead of dash
        '(SB-12345678)', // wrong brackets
      ];

      for (const invalid of invalidFormats) {
        const result = parser.extractThreadId(invalid, '');
        expect(result).toBeNull();
      }
    });

    it('extracts first thread ID when multiple are present in subject', () => {
      fc.assert(
        fc.property(hexStringArbitrary, hexStringArbitrary, (hex1, hex2) => {
          // Two thread IDs in subject
          const subject = `Re: Test [SB-${hex1}] and [SB-${hex2}]`;
          const result = parser.extractThreadId(subject, '');

          // Should extract the first one
          expect(result).not.toBeNull();
          expect(result).toBe(hex1.toLowerCase());
        }),
        { numRuns: 10 }
      );
    });

    it('handles empty subject and body', () => {
      const result = parser.extractThreadId('', '');
      expect(result).toBeNull();
    });

    it('handles whitespace-only subject and body', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 }).map((chars) => chars.join('')),
          fc.array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 10 }).map((chars) => chars.join('')),
          (subject, body) => {
            const result = parser.extractThreadId(subject, body);
            expect(result).toBeNull();
          }
        ),
        { numRuns: 10 }
      );
    });

    it('extracts thread ID from typical email reply subject format', () => {
      fc.assert(
        fc.property(hexStringArbitrary, subjectTextArbitrary, (hex, originalSubject) => {
          // Typical reply format: "Re: Original Subject [SB-12345678]"
          const subject = `Re: ${originalSubject} [SB-${hex}]`;
          const result = parser.extractThreadId(subject, '');

          expect(result).not.toBeNull();
          expect(result).toBe(hex.toLowerCase());
        }),
        { numRuns: 10 }
      );
    });

    it('extracts thread ID from typical email body footer format', () => {
      fc.assert(
        fc.property(hexStringArbitrary, bodyTextArbitrary, (hex, bodyContent) => {
          // Typical footer format as specified in design doc
          const body = `${bodyContent}\n\n---\nThread ID: [SB-${hex}]\nReply to this email to continue the conversation.`;
          const result = parser.extractThreadId('', body);

          expect(result).not.toBeNull();
          expect(result).toBe(hex.toLowerCase());
        }),
        { numRuns: 10 }
      );
    });
  });
});

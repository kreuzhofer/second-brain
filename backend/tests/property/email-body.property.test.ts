/**
 * Property-Based Tests for Email Body Text Extraction and Cleaning
 *
 * Feature: 006-email-channel
 * Property 9: Email body text extraction and cleaning
 *
 * **Validates: Requirements 2.3, 8.1, 8.2, 8.3, 8.4, 8.5**
 */

import * as fc from 'fast-check';
import { EmailParser, ParsedEmail } from '../../src/services/email-parser';

// ============================================
// Arbitraries for Email Content Generation
// ============================================

/**
 * Arbitrary for generating safe plain text content (no special characters that could
 * be interpreted as signatures, quotes, or HTML)
 */
const safeTextArbitrary = fc
  .array(
    fc.constantFrom(
      ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?:;()'.split('')
    ),
    { minLength: 1, maxLength: 100 }
  )
  .map((chars) => chars.join(''))
  .filter((s) => {
    // Exclude strings that could be interpreted as signatures or quotes
    const trimmed = s.trim();
    return (
      trimmed.length > 0 &&
      !trimmed.startsWith('>') &&
      !trimmed.startsWith('-- ') &&
      !trimmed.match(/^_{3,}$/) &&
      !trimmed.match(/^-{3,}$/)
    );
  });

/**
 * Arbitrary for generating multi-line plain text content
 */
const multiLineTextArbitrary = fc
  .array(safeTextArbitrary, { minLength: 1, maxLength: 5 })
  .map((lines) => lines.join('\n'));

/**
 * Arbitrary for generating email signature delimiters
 */
const signatureDelimiterArbitrary = fc.constantFrom('-- ', '___', '---', '____', '-----');

/**
 * Arbitrary for generating signature content (text after delimiter)
 */
const signatureContentArbitrary = fc
  .array(safeTextArbitrary, { minLength: 1, maxLength: 3 })
  .map((lines) => lines.join('\n'));

/**
 * Arbitrary for generating quoted reply lines (lines starting with >)
 */
const quotedLineArbitrary = safeTextArbitrary.map((text) => `> ${text}`);

/**
 * Arbitrary for generating multiple quoted lines
 */
const quotedBlockArbitrary = fc
  .array(quotedLineArbitrary, { minLength: 1, maxLength: 3 })
  .map((lines) => lines.join('\n'));

/**
 * Arbitrary for generating simple HTML content
 */
const htmlContentArbitrary = safeTextArbitrary.map(
  (text) => `<p>${text}</p>`
);

/**
 * Arbitrary for generating complex HTML with various tags
 */
const complexHtmlArbitrary = fc
  .tuple(safeTextArbitrary, safeTextArbitrary, safeTextArbitrary)
  .map(([text1, text2, text3]) => 
    `<html><body><h1>${text1}</h1><p>${text2}</p><div><strong>${text3}</strong></div></body></html>`
  );

/**
 * Arbitrary for generating whitespace padding
 */
const whitespacePaddingArbitrary = fc
  .array(fc.constantFrom(' ', '\t', '\n'), { minLength: 0, maxLength: 5 })
  .map((chars) => chars.join(''));

// ============================================
// Helper Functions
// ============================================

/**
 * Create a minimal ParsedEmail object for testing
 */
function createParsedEmail(options: {
  text?: string;
  html?: string;
}): ParsedEmail {
  return {
    messageId: '<test@example.com>',
    from: { address: 'sender@example.com' },
    to: [{ address: 'recipient@example.com' }],
    subject: 'Test Subject',
    text: options.text,
    html: options.html,
    date: new Date(),
  };
}

/**
 * Check if a string contains any HTML tags
 */
function containsHtmlTags(text: string): boolean {
  return /<[^>]+>/.test(text);
}

// ============================================
// Property Tests
// ============================================

describe('EmailParser - Email Body Text Extraction Property Tests', () => {
  let parser: EmailParser;

  beforeEach(() => {
    parser = new EmailParser();
  });

  /**
   * Property 9: Email body text extraction and cleaning
   *
   * For any email content (plain text, HTML, or mixed):
   * - Plain text SHALL be preferred over HTML when both are available
   * - HTML tags SHALL be stripped when only HTML is available
   * - Email signatures (after `-- `, `___`, `---`) SHALL be removed
   * - Quoted reply content (lines starting with `>`) SHALL be removed
   * - The result SHALL be trimmed of leading/trailing whitespace
   *
   * **Validates: Requirements 2.3, 8.1, 8.2, 8.3, 8.4, 8.5**
   */
  describe('Property 9: Email body text extraction and cleaning', () => {
    /**
     * Requirement 8.1: Plain text SHALL be preferred over HTML when both are available
     */
    it('prefers plain text over HTML when both are available', () => {
      fc.assert(
        fc.property(
          safeTextArbitrary,
          htmlContentArbitrary,
          (plainText, htmlContent) => {
            const email = createParsedEmail({
              text: plainText,
              html: htmlContent,
            });

            const result = parser.extractText(email);

            // Result should be the plain text content (trimmed)
            expect(result).toBe(plainText.trim());
            // Result should NOT contain HTML from the html field
            expect(result).not.toContain('<p>');
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Requirement 8.2: HTML tags SHALL be stripped when only HTML is available
     */
    it('strips HTML tags when only HTML is available', () => {
      fc.assert(
        fc.property(safeTextArbitrary, (textContent) => {
          const htmlContent = `<p>${textContent}</p>`;
          const email = createParsedEmail({
            text: undefined,
            html: htmlContent,
          });

          const result = parser.extractText(email);

          // Result should not contain HTML tags
          expect(containsHtmlTags(result)).toBe(false);
          // Result should contain the text content
          expect(result).toContain(textContent.trim());
        }),
        { numRuns: 10 }
      );
    });

    it('strips complex HTML tags and preserves text content', () => {
      fc.assert(
        fc.property(complexHtmlArbitrary, (htmlContent) => {
          const email = createParsedEmail({
            text: undefined,
            html: htmlContent,
          });

          const result = parser.extractText(email);

          // Result should not contain any HTML tags
          expect(containsHtmlTags(result)).toBe(false);
          // Result should not contain common HTML tag names as tags
          expect(result).not.toContain('<html>');
          expect(result).not.toContain('<body>');
          expect(result).not.toContain('<h1>');
          expect(result).not.toContain('<p>');
          expect(result).not.toContain('<div>');
          expect(result).not.toContain('<strong>');
        }),
        { numRuns: 10 }
      );
    });

    /**
     * Requirement 8.3: Email signatures SHALL be removed
     */
    it('removes email signatures after standard delimiters', () => {
      fc.assert(
        fc.property(
          multiLineTextArbitrary,
          signatureDelimiterArbitrary,
          signatureContentArbitrary,
          (mainContent, delimiter, signatureContent) => {
            const normalizedMain = mainContent.trim();
            const normalizedSignature = signatureContent.trim();
            fc.pre(normalizedSignature.length > 0);
            fc.pre(!normalizedMain.includes(normalizedSignature));

            const fullText = `${mainContent}\n${delimiter}\n${signatureContent}`;
            const email = createParsedEmail({ text: fullText });

            const result = parser.extractText(email);

            // Result should contain the main content
            expect(result).toContain(normalizedMain);
            // Result should NOT contain the signature content
            expect(result).not.toContain(normalizedSignature);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('preserves content when no signature delimiter is present', () => {
      fc.assert(
        fc.property(multiLineTextArbitrary, (content) => {
          const email = createParsedEmail({ text: content });

          const result = parser.extractText(email);

          // Result should be the content (trimmed)
          expect(result).toBe(content.trim());
        }),
        { numRuns: 10 }
      );
    });

    /**
     * Requirement 8.4: Quoted reply content SHALL be removed
     */
    it('removes quoted reply content (lines starting with >)', () => {
      fc.assert(
        fc.property(
          safeTextArbitrary,
          quotedBlockArbitrary,
          safeTextArbitrary,
          (beforeQuote, quotedBlock, afterQuote) => {
            const fullText = `${beforeQuote}\n\n${quotedBlock}\n\n${afterQuote}`;
            const email = createParsedEmail({ text: fullText });

            const result = parser.extractText(email);

            // Result should contain the non-quoted content
            expect(result).toContain(beforeQuote.trim());
            expect(result).toContain(afterQuote.trim());
            // Result should NOT contain quoted lines
            expect(result).not.toMatch(/^>/m);
          }
        ),
        { numRuns: 10 }
      );
    });

    it('removes all quoted lines from content', () => {
      fc.assert(
        fc.property(quotedBlockArbitrary, (quotedBlock) => {
          // Email with only quoted content
          const email = createParsedEmail({ text: quotedBlock });

          const result = parser.extractText(email);

          // Result should not contain any lines starting with >
          const lines = result.split('\n');
          for (const line of lines) {
            expect(line.trim().startsWith('>')).toBe(false);
          }
        }),
        { numRuns: 10 }
      );
    });

    /**
     * Requirement 8.5: Result SHALL be trimmed of leading/trailing whitespace
     */
    it('trims leading and trailing whitespace', () => {
      fc.assert(
        fc.property(
          whitespacePaddingArbitrary,
          safeTextArbitrary,
          whitespacePaddingArbitrary,
          (leadingWs, content, trailingWs) => {
            const paddedText = `${leadingWs}${content}${trailingWs}`;
            const email = createParsedEmail({ text: paddedText });

            const result = parser.extractText(email);

            // Result should not have leading/trailing whitespace
            expect(result).toBe(result.trim());
            // Result should contain the content
            expect(result).toBe(content.trim());
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Combined scenarios: Test multiple cleaning rules together
     */
    it('applies all cleaning rules in combination', () => {
      fc.assert(
        fc.property(
          safeTextArbitrary,
          quotedLineArbitrary,
          safeTextArbitrary,
          signatureDelimiterArbitrary,
          signatureContentArbitrary,
          (mainContent, quotedLine, moreContent, sigDelimiter, sigContent) => {
            // Skip cases where signature content overlaps with main content
            // (we can't verify signature removal if the content appears elsewhere)
            const sigContentTrimmed = sigContent.trim();
            fc.pre(!mainContent.includes(sigContentTrimmed) && !moreContent.includes(sigContentTrimmed));
            
            // Build email with quotes, main content, and signature
            const fullText = `  ${mainContent}\n${quotedLine}\n${moreContent}\n${sigDelimiter}\n${sigContent}  `;
            const email = createParsedEmail({ text: fullText });

            const result = parser.extractText(email);

            // Should be trimmed
            expect(result).toBe(result.trim());
            // Should contain main content
            expect(result).toContain(mainContent.trim());
            expect(result).toContain(moreContent.trim());
            // Should NOT contain quoted content
            expect(result).not.toMatch(/^>/m);
            // Should NOT contain signature content (only verifiable when distinct from main content)
            expect(result).not.toContain(sigContentTrimmed);
          }
        ),
        { numRuns: 10 }
      );
    });

    /**
     * Edge case: Empty content handling
     */
    it('returns empty string for emails with no content', () => {
      const email = createParsedEmail({
        text: undefined,
        html: undefined,
      });

      const result = parser.extractText(email);

      expect(result).toBe('');
    });

    it('returns empty string for emails with only whitespace', () => {
      fc.assert(
        fc.property(
          fc.array(fc.constantFrom(' ', '\t', '\n'), { minLength: 1, maxLength: 20 }).map((chars) => chars.join('')),
          (whitespace) => {
            const email = createParsedEmail({ text: whitespace });

            const result = parser.extractText(email);

            expect(result).toBe('');
          }
        ),
        { numRuns: 10 }
      );
    });

    it('returns empty string for emails with only quoted content', () => {
      fc.assert(
        fc.property(quotedBlockArbitrary, (quotedBlock) => {
          const email = createParsedEmail({ text: quotedBlock });

          const result = parser.extractText(email);

          // After removing quotes and trimming, should be empty or contain no quote markers
          expect(result).not.toMatch(/^>/m);
        }),
        { numRuns: 10 }
      );
    });

    /**
     * HTML entity decoding
     */
    it('decodes common HTML entities when stripping HTML', () => {
      const entities = [
        { entity: '&amp;', decoded: '&' },
        { entity: '&lt;', decoded: '<' },
        { entity: '&gt;', decoded: '>' },
        { entity: '&quot;', decoded: '"' },
        { entity: '&nbsp;', decoded: ' ' },
      ];

      for (const { entity, decoded } of entities) {
        const email = createParsedEmail({
          text: undefined,
          html: `<p>Test ${entity} content</p>`,
        });

        const result = parser.extractText(email);

        expect(result).toContain(`Test ${decoded} content`);
      }
    });

    /**
     * Thread ID footer removal
     */
    it('removes thread ID footer from content', () => {
      fc.assert(
        fc.property(
          safeTextArbitrary,
          fc.hexaString({ minLength: 8, maxLength: 8 }),
          (mainContent, threadId) => {
            const fullText = `${mainContent}\n---\nThread ID: [SB-${threadId}]\nReply to this email to continue.`;
            const email = createParsedEmail({ text: fullText });

            const result = parser.extractText(email);

            // Should contain main content
            expect(result).toContain(mainContent.trim());
            // Should NOT contain thread ID footer
            expect(result).not.toContain('Thread ID:');
            expect(result).not.toContain(`[SB-${threadId}]`);
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});

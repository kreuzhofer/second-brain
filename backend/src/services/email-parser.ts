/**
 * Email Parser Service
 * Parses raw email content into structured data and extracts relevant information.
 * 
 * Handles:
 * - Parsing raw email source using mailparser
 * - Extracting category hints from subject lines
 * - Extracting thread IDs from subject and body
 * - Cleaning body text (HTML stripping, signature removal, quote removal)
 * 
 * Requirements: 2.2, 2.3, 3.3, 3.4, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import { simpleParser, ParsedMail, AddressObject } from 'mailparser';

// ============================================
// Types and Interfaces
// ============================================

/**
 * Parsed email structure with normalized fields
 */
export interface ParsedEmail {
  messageId: string;
  inReplyTo?: string;
  references?: string[];
  from: EmailAddress;
  to: EmailAddress[];
  subject: string;
  text?: string;
  html?: string;
  date: Date;
}

/**
 * Email address with optional display name
 */
export interface EmailAddress {
  address: string;
  name?: string;
}

/**
 * Category hint extracted from subject line
 */
export interface CategoryHint {
  category: 'people' | 'projects' | 'ideas' | 'admin';
  originalText: string;
}

// ============================================
// Constants
// ============================================

/**
 * Pattern for extracting category hints from subject lines
 * Matches: [person], [project], [idea], [task] at the start of subject
 * Case-insensitive
 * 
 * Requirements: 2.2
 */
const HINT_PATTERN = /^\[(person|project|idea|task)\]\s*/i;

/**
 * Mapping from hint text to category
 * - person -> people
 * - project -> projects
 * - idea -> ideas
 * - task -> admin
 */
const HINT_TO_CATEGORY: Record<string, CategoryHint['category']> = {
  person: 'people',
  project: 'projects',
  idea: 'ideas',
  task: 'admin',
};

/**
 * Pattern for extracting thread IDs
 * Matches: [SB-{8 hex characters}]
 * Case-insensitive
 * 
 * Requirements: 3.3, 3.4
 */
const THREAD_ID_PATTERN = /\[SB-([a-f0-9]{8})\]/i;

/**
 * Patterns for detecting email signatures
 * Common signature delimiters:
 * - "-- " (standard signature delimiter with trailing space)
 * - "___" (three or more underscores)
 * - "---" (three or more dashes)
 * 
 * Requirements: 8.3
 */
const SIGNATURE_PATTERNS = [
  /^-- $/m,      // Standard signature delimiter (with trailing space)
  /^___+$/m,     // Three or more underscores
  /^---+$/m,     // Three or more dashes
];

/**
 * Pattern for our thread ID footer
 * Matches: "---\nThread ID: [SB-...]" and everything after
 */
const THREAD_FOOTER_PATTERN = /---\s*\nThread ID:.*$/s;

// ============================================
// Custom Errors
// ============================================

/**
 * Error thrown when email parsing fails
 */
export class EmailParseError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(`Email parsing failed: ${message}`);
    this.name = 'EmailParseError';
  }
}

// ============================================
// EmailParser Class
// ============================================

export class EmailParser {
  /**
   * Parse raw email source into structured ParsedEmail
   * 
   * @param source - Raw email content as Buffer or string
   * @returns Parsed email with normalized fields
   * @throws EmailParseError if parsing fails
   */
  async parse(source: Buffer | string): Promise<ParsedEmail> {
    try {
      const parsed = await simpleParser(source);
      return this.normalizeParsedMail(parsed);
    } catch (error) {
      throw new EmailParseError(
        error instanceof Error ? error.message : 'Unknown parsing error',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Extract plain text from email, handling HTML fallback
   * 
   * Rules:
   * - Prefer plain text over HTML (Requirement 8.1)
   * - Strip HTML tags if only HTML available (Requirement 8.2)
   * - Remove email signatures (Requirement 8.3)
   * - Remove quoted reply content (Requirement 8.4)
   * - Trim whitespace (Requirement 8.5)
   * 
   * @param email - Parsed email object
   * @returns Cleaned plain text content
   */
  extractText(email: ParsedEmail): string {
    let text = email.text || '';

    // If no plain text, strip HTML (Requirement 8.2)
    if (!text && email.html) {
      text = this.stripHtml(email.html);
    }

    // Remove quoted replies - lines starting with > (Requirement 8.4)
    text = this.removeQuotedReplies(text);

    // Remove email signatures (Requirement 8.3)
    text = this.removeSignature(text);

    // Remove our thread ID footer
    text = this.removeThreadFooter(text);

    // Trim whitespace (Requirement 8.5)
    return text.trim();
  }

  /**
   * Extract category hint from subject line
   * 
   * Matches bracket notation at the start of subject:
   * - [person] -> people
   * - [project] -> projects
   * - [idea] -> ideas
   * - [task] -> admin
   * 
   * Requirement 2.2
   * 
   * @param subject - Email subject line
   * @returns CategoryHint if found, null otherwise
   */
  extractHint(subject: string): CategoryHint | null {
    const match = subject.match(HINT_PATTERN);
    if (!match) {
      return null;
    }

    const hintText = match[1].toLowerCase();
    const category = HINT_TO_CATEGORY[hintText];

    if (!category) {
      return null;
    }

    return {
      category,
      originalText: match[0],
    };
  }

  /**
   * Extract thread ID from subject or body
   * 
   * Tries subject first, falls back to body if not found.
   * Thread ID format: [SB-{8 hex characters}]
   * 
   * Requirements: 3.3, 3.4
   * 
   * @param subject - Email subject line
   * @param body - Email body text
   * @returns Thread ID (8 hex chars) if found, null otherwise
   */
  extractThreadId(subject: string, body: string): string | null {
    // Try subject first (Requirement 3.3)
    let match = subject.match(THREAD_ID_PATTERN);
    if (match) {
      return match[1].toLowerCase();
    }

    // Fall back to body (Requirement 3.4)
    match = body.match(THREAD_ID_PATTERN);
    return match ? match[1].toLowerCase() : null;
  }

  // ============================================
  // Private Helper Methods
  // ============================================

  /**
   * Normalize mailparser output to our ParsedEmail interface
   */
  private normalizeParsedMail(parsed: ParsedMail): ParsedEmail {
    return {
      messageId: parsed.messageId || this.generateFallbackMessageId(),
      inReplyTo: parsed.inReplyTo,
      references: parsed.references
        ? (Array.isArray(parsed.references) ? parsed.references : [parsed.references])
        : undefined,
      from: this.normalizeAddress(parsed.from),
      to: this.normalizeAddressList(parsed.to),
      subject: parsed.subject || '',
      text: parsed.text,
      html: typeof parsed.html === 'string' ? parsed.html : undefined,
      date: parsed.date || new Date(),
    };
  }

  /**
   * Normalize a single address from mailparser format
   */
  private normalizeAddress(addressObj: AddressObject | undefined): EmailAddress {
    if (!addressObj || !addressObj.value || addressObj.value.length === 0) {
      return { address: 'unknown@unknown.com' };
    }

    const first = addressObj.value[0];
    return {
      address: first.address || 'unknown@unknown.com',
      name: first.name || undefined,
    };
  }

  /**
   * Normalize address list from mailparser format
   */
  private normalizeAddressList(addressObj: AddressObject | AddressObject[] | undefined): EmailAddress[] {
    if (!addressObj) {
      return [];
    }

    const addresses = Array.isArray(addressObj) ? addressObj : [addressObj];
    const result: EmailAddress[] = [];

    for (const addr of addresses) {
      if (addr.value) {
        for (const v of addr.value) {
          result.push({
            address: v.address || 'unknown@unknown.com',
            name: v.name || undefined,
          });
        }
      }
    }

    return result;
  }

  /**
   * Generate a fallback message ID if none provided
   */
  private generateFallbackMessageId(): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 10);
    return `<${timestamp}.${random}@fallback.local>`;
  }

  /**
   * Strip HTML tags from content
   * Requirement 8.2
   */
  private stripHtml(html: string): string {
    // Remove script and style elements entirely
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Replace common block elements with newlines
    text = text.replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n');

    // Remove all remaining HTML tags
    text = text.replace(/<[^>]+>/g, '');

    // Decode common HTML entities
    text = text.replace(/&nbsp;/gi, ' ');
    text = text.replace(/&amp;/gi, '&');
    text = text.replace(/&lt;/gi, '<');
    text = text.replace(/&gt;/gi, '>');
    text = text.replace(/&quot;/gi, '"');
    text = text.replace(/&#39;/gi, "'");

    // Normalize whitespace (collapse multiple newlines)
    text = text.replace(/\n{3,}/g, '\n\n');

    return text;
  }

  /**
   * Remove quoted reply content (lines starting with >)
   * Requirement 8.4
   */
  private removeQuotedReplies(text: string): string {
    return text
      .split('\n')
      .filter(line => !line.trim().startsWith('>'))
      .join('\n');
  }

  /**
   * Remove email signature
   * Requirement 8.3
   */
  private removeSignature(text: string): string {
    for (const pattern of SIGNATURE_PATTERNS) {
      const match = text.match(pattern);
      if (match && match.index !== undefined) {
        text = text.substring(0, match.index);
      }
    }
    return text;
  }

  /**
   * Remove our thread ID footer
   */
  private removeThreadFooter(text: string): string {
    return text.replace(THREAD_FOOTER_PATTERN, '');
  }
}

// ============================================
// Singleton Instance
// ============================================

let emailParserInstance: EmailParser | null = null;

/**
 * Get the EmailParser singleton instance
 */
export function getEmailParser(): EmailParser {
  if (!emailParserInstance) {
    emailParserInstance = new EmailParser();
  }
  return emailParserInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetEmailParser(): void {
  emailParserInstance = null;
}

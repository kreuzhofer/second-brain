/**
 * Unit tests for EmailParser service
 * Tests email parsing, hint extraction, thread ID extraction, and text cleaning.
 * 
 * Requirements: 2.2, 2.3, 3.3, 3.4, 8.1, 8.2, 8.3, 8.4, 8.5
 */

import {
  EmailParser,
  getEmailParser,
  resetEmailParser,
  ParsedEmail,
  CategoryHint,
  EmailParseError,
} from '../../../src/services/email-parser';

describe('EmailParser', () => {
  let parser: EmailParser;

  beforeEach(() => {
    resetEmailParser();
    parser = new EmailParser();
  });

  // ============================================
  // extractHint() - Subject Line Category Hints
  // ============================================

  describe('extractHint', () => {
    // Requirement 2.2: Extract category hints from subject line using bracket notation

    it('should extract [person] hint and map to people category', () => {
      const result = parser.extractHint('[person] John Doe contact info');
      
      expect(result).not.toBeNull();
      expect(result?.category).toBe('people');
      expect(result?.originalText).toBe('[person] ');
    });

    it('should extract [project] hint and map to projects category', () => {
      const result = parser.extractHint('[project] Website redesign');
      
      expect(result).not.toBeNull();
      expect(result?.category).toBe('projects');
      expect(result?.originalText).toBe('[project] ');
    });

    it('should extract [idea] hint and map to ideas category', () => {
      const result = parser.extractHint('[idea] New feature concept');
      
      expect(result).not.toBeNull();
      expect(result?.category).toBe('ideas');
      expect(result?.originalText).toBe('[idea] ');
    });

    it('should extract [task] hint and map to task category', () => {
      const result = parser.extractHint('[task] Pay bills');
      
      expect(result).not.toBeNull();
      expect(result?.category).toBe('task');
      expect(result?.originalText).toBe('[task] ');
    });

    it('should be case-insensitive for hints', () => {
      expect(parser.extractHint('[PERSON] Test')?.category).toBe('people');
      expect(parser.extractHint('[Person] Test')?.category).toBe('people');
      expect(parser.extractHint('[PROJECT] Test')?.category).toBe('projects');
      expect(parser.extractHint('[IDEA] Test')?.category).toBe('ideas');
      expect(parser.extractHint('[TASK] Test')?.category).toBe('task');
    });

    it('should return null for subjects without hints', () => {
      expect(parser.extractHint('Regular subject line')).toBeNull();
      expect(parser.extractHint('No brackets here')).toBeNull();
      expect(parser.extractHint('')).toBeNull();
    });

    it('should return null for hints not at the start of subject', () => {
      expect(parser.extractHint('Subject [person] in middle')).toBeNull();
      expect(parser.extractHint('  [person] with leading space')).toBeNull();
    });

    it('should return null for invalid hint types', () => {
      expect(parser.extractHint('[invalid] Not a valid hint')).toBeNull();
      expect(parser.extractHint('[people] Already plural')).toBeNull();
      expect(parser.extractHint('[projects] Already plural')).toBeNull();
    });

    it('should handle hint without trailing space', () => {
      const result = parser.extractHint('[person]John Doe');
      
      expect(result).not.toBeNull();
      expect(result?.category).toBe('people');
      expect(result?.originalText).toBe('[person]');
    });
  });

  // ============================================
  // extractThreadId() - Thread ID Extraction
  // ============================================

  describe('extractThreadId', () => {
    // Requirements 3.3, 3.4: Extract thread ID from subject or body

    it('should extract thread ID from subject', () => {
      const result = parser.extractThreadId(
        'Re: Test subject [SB-a1b2c3d4]',
        'Body content'
      );
      
      expect(result).toBe('a1b2c3d4');
    });

    it('should extract thread ID from body when not in subject', () => {
      const result = parser.extractThreadId(
        'Re: Test subject',
        'Some content\n---\nThread ID: [SB-e5f60718]'
      );
      
      expect(result).toBe('e5f60718');
    });

    it('should prefer subject over body when both have thread ID', () => {
      const result = parser.extractThreadId(
        'Re: Test [SB-aaaaaaaa]',
        'Body with [SB-bbbbbbbb]'
      );
      
      expect(result).toBe('aaaaaaaa');
    });

    it('should be case-insensitive for thread ID pattern', () => {
      expect(parser.extractThreadId('[SB-AABBCCDD]', '')).toBe('aabbccdd');
      expect(parser.extractThreadId('[sb-aabbccdd]', '')).toBe('aabbccdd');
      expect(parser.extractThreadId('', '[SB-AaBbCcDd]')).toBe('aabbccdd');
    });

    it('should return null when no thread ID is found', () => {
      expect(parser.extractThreadId('Regular subject', 'Regular body')).toBeNull();
      expect(parser.extractThreadId('', '')).toBeNull();
    });

    it('should not match invalid thread ID formats', () => {
      // Too short
      expect(parser.extractThreadId('[SB-a1b2c3]', '')).toBeNull();
      // Too long
      expect(parser.extractThreadId('[SB-a1b2c3d4e5]', '')).toBeNull();
      // Invalid characters
      expect(parser.extractThreadId('[SB-a1b2c3g4]', '')).toBeNull();
      // Missing brackets
      expect(parser.extractThreadId('SB-a1b2c3d4', '')).toBeNull();
    });

    it('should extract thread ID from anywhere in subject', () => {
      expect(parser.extractThreadId('Start [SB-12345678] End', '')).toBe('12345678');
      expect(parser.extractThreadId('[SB-12345678]', '')).toBe('12345678');
    });

    it('should extract thread ID from anywhere in body', () => {
      const body = `
        Hello,
        
        This is a reply.
        
        ---
        Thread ID: [SB-abcdef12]
        Reply to continue.
      `;
      
      expect(parser.extractThreadId('', body)).toBe('abcdef12');
    });
  });

  // ============================================
  // extractText() - Body Text Extraction
  // ============================================

  describe('extractText', () => {
    // Requirements 8.1, 8.2, 8.3, 8.4, 8.5

    it('should prefer plain text over HTML (Requirement 8.1)', () => {
      const email: ParsedEmail = {
        messageId: '<test@example.com>',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Plain text content',
        html: '<p>HTML content</p>',
        date: new Date(),
      };

      const result = parser.extractText(email);
      expect(result).toBe('Plain text content');
    });

    it('should strip HTML tags when only HTML is available (Requirement 8.2)', () => {
      const email: ParsedEmail = {
        messageId: '<test@example.com>',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        html: '<p>HTML <strong>content</strong> here</p>',
        date: new Date(),
      };

      const result = parser.extractText(email);
      expect(result).toContain('HTML');
      expect(result).toContain('content');
      expect(result).toContain('here');
      expect(result).not.toContain('<p>');
      expect(result).not.toContain('<strong>');
    });

    it('should remove email signatures after "-- " (Requirement 8.3)', () => {
      const email: ParsedEmail = {
        messageId: '<test@example.com>',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Main content\n-- \nJohn Doe\nCompany Inc.',
        date: new Date(),
      };

      const result = parser.extractText(email);
      expect(result).toBe('Main content');
    });

    it('should remove email signatures after "___" (Requirement 8.3)', () => {
      const email: ParsedEmail = {
        messageId: '<test@example.com>',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Main content\n___\nSignature here',
        date: new Date(),
      };

      const result = parser.extractText(email);
      expect(result).toBe('Main content');
    });

    it('should remove email signatures after "---" (Requirement 8.3)', () => {
      const email: ParsedEmail = {
        messageId: '<test@example.com>',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Main content\n---\nSignature here',
        date: new Date(),
      };

      const result = parser.extractText(email);
      expect(result).toBe('Main content');
    });

    it('should remove quoted reply content (Requirement 8.4)', () => {
      const email: ParsedEmail = {
        messageId: '<test@example.com>',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'My reply\n\n> Original message\n> More original content\n\nMore of my reply',
        date: new Date(),
      };

      const result = parser.extractText(email);
      expect(result).toContain('My reply');
      expect(result).toContain('More of my reply');
      expect(result).not.toContain('Original message');
      expect(result).not.toContain('More original content');
    });

    it('should trim whitespace (Requirement 8.5)', () => {
      const email: ParsedEmail = {
        messageId: '<test@example.com>',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: '   \n\n  Content with whitespace  \n\n   ',
        date: new Date(),
      };

      const result = parser.extractText(email);
      expect(result).toBe('Content with whitespace');
    });

    it('should remove thread ID footer', () => {
      const email: ParsedEmail = {
        messageId: '<test@example.com>',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: 'Main content\n---\nThread ID: [SB-a1b2c3d4]\nReply to continue.',
        date: new Date(),
      };

      const result = parser.extractText(email);
      expect(result).toBe('Main content');
    });

    it('should handle combined cleaning scenarios', () => {
      const email: ParsedEmail = {
        messageId: '<test@example.com>',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        text: '  My reply content  \n\n> Quoted text\n> More quoted\n\nAnother paragraph\n-- \nSignature',
        date: new Date(),
      };

      const result = parser.extractText(email);
      expect(result).toContain('My reply content');
      expect(result).toContain('Another paragraph');
      expect(result).not.toContain('Quoted text');
      expect(result).not.toContain('Signature');
    });

    it('should return empty string for email with no content', () => {
      const email: ParsedEmail = {
        messageId: '<test@example.com>',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        date: new Date(),
      };

      const result = parser.extractText(email);
      expect(result).toBe('');
    });

    it('should decode HTML entities when stripping HTML', () => {
      const email: ParsedEmail = {
        messageId: '<test@example.com>',
        from: { address: 'sender@example.com' },
        to: [{ address: 'recipient@example.com' }],
        subject: 'Test',
        html: '<p>Test &amp; verify &lt;content&gt;</p>',
        date: new Date(),
      };

      const result = parser.extractText(email);
      expect(result).toContain('Test & verify <content>');
    });
  });

  // ============================================
  // parse() - Raw Email Parsing
  // ============================================

  describe('parse', () => {
    it('should parse a simple email', async () => {
      const rawEmail = `From: sender@example.com
To: recipient@example.com
Subject: Test Subject
Message-ID: <test123@example.com>
Date: Mon, 01 Jan 2024 12:00:00 +0000

This is the email body.`;

      const result = await parser.parse(rawEmail);

      expect(result.messageId).toBe('<test123@example.com>');
      expect(result.from.address).toBe('sender@example.com');
      expect(result.to[0].address).toBe('recipient@example.com');
      expect(result.subject).toBe('Test Subject');
      expect(result.text).toContain('This is the email body.');
    });

    it('should parse email with In-Reply-To header', async () => {
      const rawEmail = `From: sender@example.com
To: recipient@example.com
Subject: Re: Test Subject
Message-ID: <reply123@example.com>
In-Reply-To: <original123@example.com>
Date: Mon, 01 Jan 2024 12:00:00 +0000

Reply content.`;

      const result = await parser.parse(rawEmail);

      expect(result.messageId).toBe('<reply123@example.com>');
      expect(result.inReplyTo).toBe('<original123@example.com>');
    });

    it('should parse email with display names', async () => {
      const rawEmail = `From: "John Doe" <john@example.com>
To: "Jane Smith" <jane@example.com>
Subject: Test
Message-ID: <test@example.com>
Date: Mon, 01 Jan 2024 12:00:00 +0000

Body.`;

      const result = await parser.parse(rawEmail);

      expect(result.from.address).toBe('john@example.com');
      expect(result.from.name).toBe('John Doe');
      expect(result.to[0].address).toBe('jane@example.com');
      expect(result.to[0].name).toBe('Jane Smith');
    });

    it('should handle email with HTML content', async () => {
      const rawEmail = `From: sender@example.com
To: recipient@example.com
Subject: HTML Test
Message-ID: <html@example.com>
Date: Mon, 01 Jan 2024 12:00:00 +0000
Content-Type: text/html

<html><body><p>HTML content</p></body></html>`;

      const result = await parser.parse(rawEmail);

      expect(result.html).toContain('<p>HTML content</p>');
    });

    it('should generate fallback message ID if missing', async () => {
      const rawEmail = `From: sender@example.com
To: recipient@example.com
Subject: No Message ID
Date: Mon, 01 Jan 2024 12:00:00 +0000

Body.`;

      const result = await parser.parse(rawEmail);

      expect(result.messageId).toMatch(/<\d+\.[a-z0-9]+@fallback\.local>/);
    });

    it('should handle malformed email gracefully', async () => {
      // mailparser is very lenient - it handles most malformed content
      // by returning default values rather than throwing
      const result = await parser.parse(Buffer.from([0x00, 0x01, 0x02]));
      
      // Should return a valid ParsedEmail with fallback values
      expect(result.messageId).toMatch(/<.+@fallback\.local>/);
      expect(result.from.address).toBe('unknown@unknown.com');
      expect(result.to).toEqual([]);
      expect(result.subject).toBe('');
    });
  });

  // ============================================
  // Singleton Behavior
  // ============================================

  describe('singleton', () => {
    it('should return the same instance on multiple calls', () => {
      const instance1 = getEmailParser();
      const instance2 = getEmailParser();
      
      expect(instance1).toBe(instance2);
    });

    it('should return new instance after reset', () => {
      const instance1 = getEmailParser();
      resetEmailParser();
      const instance2 = getEmailParser();
      
      expect(instance1).not.toBe(instance2);
    });
  });
});

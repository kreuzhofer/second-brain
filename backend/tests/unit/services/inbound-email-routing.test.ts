import { extractRecipientCode } from '../../../src/services/imap-poller';
import { getInboundEmailAddress, resetEmailConfig } from '../../../src/config/email';
import { UserService } from '../../../src/services/user.service';

describe('extractRecipientCode', () => {
  it('extracts 6-char hex code from +suffix', () => {
    expect(extractRecipientCode([{ address: 'user+a3f2e1@example.com' }])).toBe('a3f2e1');
  });

  it('returns null when no +suffix', () => {
    expect(extractRecipientCode([{ address: 'user@example.com' }])).toBeNull();
  });

  it('returns null for empty recipients', () => {
    expect(extractRecipientCode([])).toBeNull();
  });

  it('extracts code from second recipient', () => {
    expect(extractRecipientCode([
      { address: 'other@example.com' },
      { address: 'user+b4c5d6@example.com' },
    ])).toBe('b4c5d6');
  });

  it('normalizes uppercase to lowercase', () => {
    expect(extractRecipientCode([{ address: 'user+A3F2E1@example.com' }])).toBe('a3f2e1');
  });

  it('returns null for non-hex +suffix', () => {
    expect(extractRecipientCode([{ address: 'user+zzzzzz@example.com' }])).toBeNull();
  });

  it('returns null for short +suffix (less than 6 chars)', () => {
    expect(extractRecipientCode([{ address: 'user+a3f@example.com' }])).toBeNull();
  });

  it('returns null for long +suffix (more than 6 hex chars)', () => {
    // The regex matches exactly 6 hex chars followed by @, so "a3f2e1b" won't match
    // because the 7th char is 'b' and then '@' is not immediately after 6 chars
    expect(extractRecipientCode([{ address: 'user+a3f2e1b@example.com' }])).toBeNull();
  });

  it('handles recipients with display names', () => {
    expect(extractRecipientCode([
      { address: 'user+aabbcc@example.com', name: 'User Name' },
    ])).toBe('aabbcc');
  });
});

describe('getInboundEmailAddress', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    resetEmailConfig();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    resetEmailConfig();
  });

  it('returns null when IMAP is not configured', () => {
    // No IMAP env vars set — config.imap will be null
    delete process.env.IMAP_HOST;
    delete process.env.IMAP_USER;
    delete process.env.IMAP_PASS;
    resetEmailConfig();
    expect(getInboundEmailAddress('a3f2e1')).toBeNull();
  });

  it('builds address from IMAP_USER when configured', () => {
    process.env.IMAP_HOST = 'imap.example.com';
    process.env.IMAP_USER = 'inbox@example.com';
    process.env.IMAP_PASS = 'secret';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'smtp@example.com';
    process.env.SMTP_PASS = 'secret';
    resetEmailConfig();
    expect(getInboundEmailAddress('a3f2e1')).toBe('inbox+a3f2e1@example.com');
  });

  it('uses IMAP_INBOUND_DOMAIN override', () => {
    process.env.IMAP_HOST = 'imap.example.com';
    process.env.IMAP_USER = 'inbox@internal.example.com';
    process.env.IMAP_PASS = 'secret';
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_USER = 'smtp@example.com';
    process.env.SMTP_PASS = 'secret';
    process.env.IMAP_INBOUND_DOMAIN = 'public.example.com';
    resetEmailConfig();
    expect(getInboundEmailAddress('b4c5d6')).toBe('inbox+b4c5d6@public.example.com');
  });
});

describe('generateInboundEmailCode', () => {
  const userService = new UserService();

  it('returns a 6-character hex string', () => {
    const code = userService.generateInboundEmailCode();
    expect(code).toMatch(/^[a-f0-9]{6}$/);
  });

  it('generates different codes', () => {
    const codes = new Set(Array.from({ length: 10 }, () => userService.generateInboundEmailCode()));
    // With 10 random 6-char hex codes, collision is extremely unlikely
    expect(codes.size).toBeGreaterThanOrEqual(9);
  });
});

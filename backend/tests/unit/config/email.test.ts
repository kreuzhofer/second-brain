/**
 * Unit tests for email configuration loading
 * Tests configuration loading from environment variables with various scenarios.
 * 
 * Requirements: 1.4 - Graceful degradation when email environment variables are missing
 */

import {
  loadEmailConfig,
  getEmailConfig,
  resetEmailConfig,
  EmailConfig,
} from '../../../src/config/email';

describe('Email Configuration', () => {
  // Store original env vars to restore after tests
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Reset singleton before each test
    resetEmailConfig();
    // Clear all email-related env vars
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.IMAP_HOST;
    delete process.env.IMAP_USER;
    delete process.env.IMAP_PASS;
    delete process.env.EMAIL_POLL_INTERVAL;
  });

  afterAll(() => {
    // Restore original env vars
    process.env = originalEnv;
  });

  // ============================================
  // loadEmailConfig() - All Variables Set
  // ============================================

  describe('loadEmailConfig - all variables set', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'smtp-user@example.com';
      process.env.SMTP_PASS = 'smtp-password';
      process.env.IMAP_HOST = 'imap.example.com';
      process.env.IMAP_USER = 'imap-user@example.com';
      process.env.IMAP_PASS = 'imap-password';
      process.env.EMAIL_POLL_INTERVAL = '120';
    });

    it('should return enabled: true when all variables are set', () => {
      const config = loadEmailConfig();
      expect(config.enabled).toBe(true);
    });

    it('should correctly load SMTP configuration', () => {
      const config = loadEmailConfig();
      
      expect(config.smtp).not.toBeNull();
      expect(config.smtp?.host).toBe('smtp.example.com');
      expect(config.smtp?.port).toBe(587);
      expect(config.smtp?.user).toBe('smtp-user@example.com');
      expect(config.smtp?.pass).toBe('smtp-password');
      expect(config.smtp?.secure).toBe(false); // Port 587 is not secure
    });

    it('should correctly load IMAP configuration', () => {
      const config = loadEmailConfig();
      
      expect(config.imap).not.toBeNull();
      expect(config.imap?.host).toBe('imap.example.com');
      expect(config.imap?.user).toBe('imap-user@example.com');
      expect(config.imap?.pass).toBe('imap-password');
      expect(config.imap?.port).toBe(993); // Default IMAP port
      expect(config.imap?.tls).toBe(true);
    });

    it('should correctly load poll interval', () => {
      const config = loadEmailConfig();
      expect(config.pollInterval).toBe(120);
    });

    it('should set secure: true for port 465', () => {
      process.env.SMTP_PORT = '465';
      const config = loadEmailConfig();
      
      expect(config.smtp?.port).toBe(465);
      expect(config.smtp?.secure).toBe(true);
    });

    it('should use default SMTP port (587) when not specified', () => {
      delete process.env.SMTP_PORT;
      const config = loadEmailConfig();
      
      expect(config.smtp?.port).toBe(587);
      expect(config.smtp?.secure).toBe(false);
    });

    it('should use default poll interval (60) when not specified', () => {
      delete process.env.EMAIL_POLL_INTERVAL;
      const config = loadEmailConfig();
      
      expect(config.pollInterval).toBe(60);
    });
  });

  // ============================================
  // loadEmailConfig() - Partial Variables (SMTP Only)
  // ============================================

  describe('loadEmailConfig - SMTP only', () => {
    beforeEach(() => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '587';
      process.env.SMTP_USER = 'smtp-user@example.com';
      process.env.SMTP_PASS = 'smtp-password';
    });

    it('should return enabled: false when only SMTP is configured', () => {
      const config = loadEmailConfig();
      expect(config.enabled).toBe(false);
    });

    it('should have SMTP config populated', () => {
      const config = loadEmailConfig();
      
      expect(config.smtp).not.toBeNull();
      expect(config.smtp?.host).toBe('smtp.example.com');
    });

    it('should have IMAP config as null', () => {
      const config = loadEmailConfig();
      expect(config.imap).toBeNull();
    });
  });

  // ============================================
  // loadEmailConfig() - Partial Variables (IMAP Only)
  // ============================================

  describe('loadEmailConfig - IMAP only', () => {
    beforeEach(() => {
      process.env.IMAP_HOST = 'imap.example.com';
      process.env.IMAP_USER = 'imap-user@example.com';
      process.env.IMAP_PASS = 'imap-password';
    });

    it('should return enabled: false when only IMAP is configured', () => {
      const config = loadEmailConfig();
      expect(config.enabled).toBe(false);
    });

    it('should have IMAP config populated', () => {
      const config = loadEmailConfig();
      
      expect(config.imap).not.toBeNull();
      expect(config.imap?.host).toBe('imap.example.com');
    });

    it('should have SMTP config as null', () => {
      const config = loadEmailConfig();
      expect(config.smtp).toBeNull();
    });
  });

  // ============================================
  // loadEmailConfig() - No Variables (Graceful Degradation)
  // ============================================

  describe('loadEmailConfig - no variables (graceful degradation)', () => {
    it('should return enabled: false when no variables are set', () => {
      const config = loadEmailConfig();
      expect(config.enabled).toBe(false);
    });

    it('should have SMTP config as null', () => {
      const config = loadEmailConfig();
      expect(config.smtp).toBeNull();
    });

    it('should have IMAP config as null', () => {
      const config = loadEmailConfig();
      expect(config.imap).toBeNull();
    });

    it('should use default poll interval', () => {
      const config = loadEmailConfig();
      expect(config.pollInterval).toBe(60);
    });

    it('should not throw an error', () => {
      expect(() => loadEmailConfig()).not.toThrow();
    });
  });

  // ============================================
  // loadEmailConfig() - Invalid Port Values
  // ============================================

  describe('loadEmailConfig - invalid port values', () => {
    beforeEach(() => {
      // Set up complete config so we can test port parsing
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'smtp-user@example.com';
      process.env.SMTP_PASS = 'smtp-password';
      process.env.IMAP_HOST = 'imap.example.com';
      process.env.IMAP_USER = 'imap-user@example.com';
      process.env.IMAP_PASS = 'imap-password';
    });

    it('should use default SMTP port for non-numeric value', () => {
      process.env.SMTP_PORT = 'not-a-number';
      const config = loadEmailConfig();
      
      expect(config.smtp?.port).toBe(587);
    });

    it('should use default SMTP port for empty string', () => {
      process.env.SMTP_PORT = '';
      const config = loadEmailConfig();
      
      expect(config.smtp?.port).toBe(587);
    });

    it('should use default SMTP port for negative number', () => {
      process.env.SMTP_PORT = '-1';
      const config = loadEmailConfig();
      
      expect(config.smtp?.port).toBe(587);
    });

    it('should use default SMTP port for zero', () => {
      process.env.SMTP_PORT = '0';
      const config = loadEmailConfig();
      
      expect(config.smtp?.port).toBe(587);
    });

    it('should use default SMTP port for port > 65535', () => {
      process.env.SMTP_PORT = '70000';
      const config = loadEmailConfig();
      
      expect(config.smtp?.port).toBe(587);
    });

    it('should use default poll interval for non-numeric value', () => {
      process.env.EMAIL_POLL_INTERVAL = 'invalid';
      const config = loadEmailConfig();
      
      expect(config.pollInterval).toBe(60);
    });

    it('should use default poll interval for negative number', () => {
      process.env.EMAIL_POLL_INTERVAL = '-30';
      const config = loadEmailConfig();
      
      expect(config.pollInterval).toBe(60);
    });

    it('should use default poll interval for zero', () => {
      process.env.EMAIL_POLL_INTERVAL = '0';
      const config = loadEmailConfig();
      
      expect(config.pollInterval).toBe(60);
    });

    it('should accept valid custom port', () => {
      process.env.SMTP_PORT = '2525';
      const config = loadEmailConfig();
      
      expect(config.smtp?.port).toBe(2525);
    });

    it('should accept valid custom poll interval', () => {
      process.env.EMAIL_POLL_INTERVAL = '300';
      const config = loadEmailConfig();
      
      expect(config.pollInterval).toBe(300);
    });
  });

  // ============================================
  // loadEmailConfig() - Partial SMTP/IMAP Config
  // ============================================

  describe('loadEmailConfig - incomplete SMTP/IMAP config', () => {
    it('should have SMTP as null when SMTP_HOST is missing', () => {
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';
      
      const config = loadEmailConfig();
      expect(config.smtp).toBeNull();
    });

    it('should have SMTP as null when SMTP_USER is missing', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PASS = 'pass';
      
      const config = loadEmailConfig();
      expect(config.smtp).toBeNull();
    });

    it('should have SMTP as null when SMTP_PASS is missing', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user';
      
      const config = loadEmailConfig();
      expect(config.smtp).toBeNull();
    });

    it('should have IMAP as null when IMAP_HOST is missing', () => {
      process.env.IMAP_USER = 'user';
      process.env.IMAP_PASS = 'pass';
      
      const config = loadEmailConfig();
      expect(config.imap).toBeNull();
    });

    it('should have IMAP as null when IMAP_USER is missing', () => {
      process.env.IMAP_HOST = 'imap.example.com';
      process.env.IMAP_PASS = 'pass';
      
      const config = loadEmailConfig();
      expect(config.imap).toBeNull();
    });

    it('should have IMAP as null when IMAP_PASS is missing', () => {
      process.env.IMAP_HOST = 'imap.example.com';
      process.env.IMAP_USER = 'user';
      
      const config = loadEmailConfig();
      expect(config.imap).toBeNull();
    });
  });

  // ============================================
  // getEmailConfig() - Singleton Behavior
  // ============================================

  describe('getEmailConfig - singleton behavior', () => {
    it('should return the same instance on multiple calls', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';
      process.env.IMAP_HOST = 'imap.example.com';
      process.env.IMAP_USER = 'user';
      process.env.IMAP_PASS = 'pass';

      const config1 = getEmailConfig();
      const config2 = getEmailConfig();
      
      expect(config1).toBe(config2);
    });

    it('should not reload config after env vars change', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';
      process.env.IMAP_HOST = 'imap.example.com';
      process.env.IMAP_USER = 'user';
      process.env.IMAP_PASS = 'pass';

      const config1 = getEmailConfig();
      
      // Change env vars
      process.env.SMTP_HOST = 'different.example.com';
      
      const config2 = getEmailConfig();
      
      // Should still have original value
      expect(config2.smtp?.host).toBe('smtp.example.com');
    });
  });

  // ============================================
  // resetEmailConfig() - Reset Behavior
  // ============================================

  describe('resetEmailConfig - reset behavior', () => {
    it('should allow reloading config after reset', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_USER = 'user';
      process.env.SMTP_PASS = 'pass';
      process.env.IMAP_HOST = 'imap.example.com';
      process.env.IMAP_USER = 'user';
      process.env.IMAP_PASS = 'pass';

      const config1 = getEmailConfig();
      expect(config1.smtp?.host).toBe('smtp.example.com');
      
      // Reset and change env vars
      resetEmailConfig();
      process.env.SMTP_HOST = 'different.example.com';
      
      const config2 = getEmailConfig();
      
      // Should have new value
      expect(config2.smtp?.host).toBe('different.example.com');
    });
  });
});

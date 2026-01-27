/**
 * Email configuration module
 * Loads email settings from environment variables for SMTP/IMAP functionality
 * 
 * The email channel is optional - when not configured, the application
 * continues to function normally without email capabilities.
 */

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure: boolean;
}

export interface ImapConfig {
  host: string;
  user: string;
  pass: string;
  port: number;
  tls: boolean;
}

export interface EmailConfig {
  smtp: SmtpConfig | null;
  imap: ImapConfig | null;
  pollInterval: number; // seconds
  enabled: boolean;
}

/**
 * Default values for email configuration
 */
const DEFAULTS = {
  SMTP_PORT: 587,
  IMAP_PORT: 993,
  POLL_INTERVAL: 60, // seconds
} as const;

/**
 * Checks if SMTP is fully configured
 * Requires: SMTP_HOST, SMTP_USER, SMTP_PASS
 */
function isSmtpConfigured(): boolean {
  return !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );
}

/**
 * Checks if IMAP is fully configured
 * Requires: IMAP_HOST, IMAP_USER, IMAP_PASS
 */
function isImapConfigured(): boolean {
  return !!(
    process.env.IMAP_HOST &&
    process.env.IMAP_USER &&
    process.env.IMAP_PASS
  );
}

/**
 * Parses SMTP port from environment variable
 * Returns default port (587) if not set or invalid
 */
function parseSmtpPort(): number {
  const portStr = process.env.SMTP_PORT;
  if (!portStr) {
    return DEFAULTS.SMTP_PORT;
  }
  
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.warn(`Invalid SMTP_PORT "${portStr}", using default ${DEFAULTS.SMTP_PORT}`);
    return DEFAULTS.SMTP_PORT;
  }
  
  return port;
}

/**
 * Determines if SMTP should use secure connection (TLS)
 * 
 * Logic:
 * 1. If SMTP_SECURE env var is explicitly set, use that value
 * 2. Otherwise, auto-detect based on port:
 *    - Port 465: secure = true (implicit TLS)
 *    - Port 587: secure = false (STARTTLS upgrade)
 *    - Other ports: secure = false (STARTTLS upgrade)
 * 
 * Note: When secure=false, nodemailer will automatically upgrade
 * to TLS via STARTTLS if the server supports it.
 */
function parseSmtpSecure(port: number): boolean {
  const secureStr = process.env.SMTP_SECURE;
  
  // If explicitly set, use that value
  if (secureStr !== undefined && secureStr !== '') {
    const lower = secureStr.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') {
      return true;
    }
    if (lower === 'false' || lower === '0' || lower === 'no') {
      return false;
    }
    console.warn(`Invalid SMTP_SECURE "${secureStr}", auto-detecting based on port`);
  }
  
  // Auto-detect based on port
  // Port 465 uses implicit TLS (secure from start)
  // Port 587 and others use STARTTLS (upgrade after connect)
  return port === 465;
}

/**
 * Parses poll interval from environment variable
 * Returns default interval (60 seconds) if not set or invalid
 */
function parsePollInterval(): number {
  const intervalStr = process.env.EMAIL_POLL_INTERVAL;
  if (!intervalStr) {
    return DEFAULTS.POLL_INTERVAL;
  }
  
  const interval = parseInt(intervalStr, 10);
  if (isNaN(interval) || interval < 1) {
    console.warn(`Invalid EMAIL_POLL_INTERVAL "${intervalStr}", using default ${DEFAULTS.POLL_INTERVAL}`);
    return DEFAULTS.POLL_INTERVAL;
  }
  
  return interval;
}

/**
 * Loads email configuration from environment variables
 * 
 * Email is enabled only if both SMTP and IMAP are fully configured.
 * Missing variables result in graceful degradation (enabled: false).
 * 
 * Environment variables:
 * - SMTP_HOST: SMTP server hostname
 * - SMTP_PORT: SMTP server port (default: 587)
 * - SMTP_USER: SMTP authentication username
 * - SMTP_PASS: SMTP authentication password
 * - IMAP_HOST: IMAP server hostname
 * - IMAP_USER: IMAP authentication username
 * - IMAP_PASS: IMAP authentication password
 * - EMAIL_POLL_INTERVAL: Polling interval in seconds (default: 60)
 * 
 * @returns EmailConfig object with configuration values
 */
export function loadEmailConfig(): EmailConfig {
  const smtpConfigured = isSmtpConfigured();
  const imapConfigured = isImapConfigured();
  const enabled = smtpConfigured && imapConfigured;
  
  // Log warning if email is not fully configured
  if (!enabled) {
    const missing: string[] = [];
    if (!smtpConfigured) {
      if (!process.env.SMTP_HOST) missing.push('SMTP_HOST');
      if (!process.env.SMTP_USER) missing.push('SMTP_USER');
      if (!process.env.SMTP_PASS) missing.push('SMTP_PASS');
    }
    if (!imapConfigured) {
      if (!process.env.IMAP_HOST) missing.push('IMAP_HOST');
      if (!process.env.IMAP_USER) missing.push('IMAP_USER');
      if (!process.env.IMAP_PASS) missing.push('IMAP_PASS');
    }
    
    if (missing.length > 0) {
      console.warn(
        `Email channel disabled: missing environment variables: ${missing.join(', ')}`
      );
    }
  }
  
  const smtpPort = parseSmtpPort();
  const smtpSecure = parseSmtpSecure(smtpPort);
  
  return {
    smtp: smtpConfigured
      ? {
          host: process.env.SMTP_HOST!,
          port: smtpPort,
          user: process.env.SMTP_USER!,
          pass: process.env.SMTP_PASS!,
          secure: smtpSecure,
        }
      : null,
    imap: imapConfigured
      ? {
          host: process.env.IMAP_HOST!,
          user: process.env.IMAP_USER!,
          pass: process.env.IMAP_PASS!,
          port: DEFAULTS.IMAP_PORT,
          tls: true,
        }
      : null,
    pollInterval: parsePollInterval(),
    enabled,
  };
}

// Singleton instance
let emailConfigInstance: EmailConfig | null = null;

/**
 * Gets the email configuration singleton
 * Loads configuration on first call, returns cached instance thereafter
 * 
 * @returns EmailConfig singleton instance
 */
export function getEmailConfig(): EmailConfig {
  if (!emailConfigInstance) {
    emailConfigInstance = loadEmailConfig();
  }
  return emailConfigInstance;
}

/**
 * Resets the email configuration singleton (for testing purposes)
 */
export function resetEmailConfig(): void {
  emailConfigInstance = null;
}

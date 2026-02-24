/**
 * Environment configuration module
 * Loads and validates environment variables
 */

export interface EnvConfig {
  // Required
  OPENAI_API_KEY: string;
  DATABASE_URL: string;
  JWT_SECRET: string;
  DEFAULT_USER_EMAIL: string;
  DEFAULT_USER_PASSWORD: string;
  DEFAULT_USER_NAME?: string;
  JWT_EXPIRES_IN: string;
  
  // Optional with defaults
  TIMEZONE: string;
  PORT: number;

  // OpenAI model configuration (optional with defaults)
  OPENAI_MODEL_CHAT_TOOL_CALL: string;
  OPENAI_MODEL_CHAT_FINAL_RESPONSE: string;
  OPENAI_MODEL_CLASSIFICATION: string;
  OPENAI_MODEL_SUMMARIZATION: string;
  OPENAI_MODEL_ACTION_EXTRACTION: string;
  OPENAI_MODEL_DAILY_TIP: string;
  OPENAI_MODEL_FOCUS_CONGRATS: string;
  OPENAI_MODEL_INTENT_ANALYSIS: string;
  OPENAI_MODEL_TOOL_GUARDRAIL: string;
  OPENAI_MODEL_EMBEDDING: string;
  
  // Chat configuration (optional with defaults)
  CONFIDENCE_THRESHOLD: number;
  MAX_VERBATIM_MESSAGES: number;
  SUMMARIZE_BATCH_SIZE: number;
  
  // Digest configuration (optional with defaults)
  DIGEST_TIME: string;
  WEEKLY_REVIEW_DAY: string;
  WEEKLY_REVIEW_TIME: string;
  STALE_INBOX_DAYS: number;
  
  // Proactive cron configuration (optional with defaults)
  STALE_DAYS: number;
  INACTIVITY_DAYS: number;
  STALE_CHECK_TIME: string;
  FOLLOWUP_REMINDER_TIME: string;
  INACTIVITY_NUDGE_TIME: string;
  
  // Digest email delivery (optional)
  DIGEST_RECIPIENT_EMAIL?: string;
  
  // When true, skip chat delivery of digests when email is configured (default: true)
  DIGEST_SKIP_CHAT_WHEN_EMAIL: boolean;

  // Focus music configuration (optional)
  YOUTUBE_API_KEY?: string;
  FOCUS_MUSIC_SEARCH_TERMS: string[];
  FOCUS_MUSIC_RESULTS_LIMIT: number;

  // Offline queue configuration
  OFFLINE_QUEUE_ENABLED: boolean;
  OFFLINE_QUEUE_REPLAY_INTERVAL_SEC: number;
  OFFLINE_QUEUE_PROCESSING_TIMEOUT_SEC: number;
  OFFLINE_QUEUE_RETRY_BASE_SEC: number;
  OFFLINE_QUEUE_MAX_ATTEMPTS: number;
  OFFLINE_QUEUE_DEDUPE_TTL_HOURS: number;

  // Entry revision retention
  ENTRY_REVISION_MAX_PER_ENTRY: number;
  ENTRY_REVISION_MAX_DAYS?: number;

  // Web Push Notifications (optional)
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

/**
 * Email Channel Environment Variables (all optional)
 * 
 * The email channel is completely optional. When not configured, the application
 * functions normally without email capabilities.
 * 
 * SMTP Configuration (for sending emails):
 * - SMTP_HOST: SMTP server hostname (e.g., "smtp.gmail.com")
 * - SMTP_PORT: SMTP server port (default: 587)
 *   - Port 465: Uses implicit TLS (connection encrypted from start)
 *   - Port 587: Uses STARTTLS (starts unencrypted, upgrades to TLS)
 * - SMTP_USER: SMTP authentication username (usually email address)
 * - SMTP_PASS: SMTP authentication password or app-specific password
 * - SMTP_SECURE: Override TLS mode (optional, auto-detected from port)
 *   - "true"/"yes"/"1": Force implicit TLS (like port 465)
 *   - "false"/"no"/"0": Force STARTTLS upgrade (like port 587)
 *   - Not set: Auto-detect based on port (465=TLS, others=STARTTLS)
 * 
 * IMAP Configuration (for receiving emails):
 * - IMAP_HOST: IMAP server hostname (e.g., "imap.gmail.com")
 * - IMAP_PORT: IMAP server port (default: 993 for TLS)
 * - IMAP_USER: IMAP authentication username (usually email address)
 * - IMAP_PASS: IMAP authentication password or app-specific password
 * 
 * Polling Configuration:
 * - EMAIL_POLL_INTERVAL: Seconds between IMAP polls (default: 60)
 * 
 * Email channel is enabled only when ALL of the following are set:
 * - SMTP_HOST, SMTP_USER, SMTP_PASS (for sending)
 * - IMAP_HOST, IMAP_USER, IMAP_PASS (for receiving)
 * 
 * At startup, the application verifies connectivity to both SMTP and IMAP
 * servers and logs the results. Check logs for "connection verified ✓" or
 * error messages if email is not working.
 * 
 * See backend/src/config/email.ts for detailed configuration handling.
 */

export class MissingEnvVarError extends Error {
  constructor(varName: string) {
    super(`Required environment variable not set: ${varName}`);
    this.name = 'MissingEnvVarError';
  }
}

const REQUIRED_ENV_VARS = [
  'OPENAI_API_KEY',
  'DATABASE_URL',
  'JWT_SECRET',
  'DEFAULT_USER_EMAIL',
  'DEFAULT_USER_PASSWORD',
] as const;

/**
 * Validates that all required environment variables are set
 * @throws MissingEnvVarError if any required variable is missing
 */
export function validateRequiredEnvVars(): void {
  for (const varName of REQUIRED_ENV_VARS) {
    if (!process.env[varName]) {
      throw new MissingEnvVarError(varName);
    }
  }
}

/**
 * Validate time format (HH:MM)
 * @returns true if valid, false otherwise
 */
function isValidTimeFormat(time: string): boolean {
  const match = time.match(/^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/);
  return match !== null;
}

/**
 * Validate day of week
 * @returns true if valid, false otherwise
 */
function isValidDayOfWeek(day: string): boolean {
  const validDays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return validDays.includes(day.toLowerCase());
}

/**
 * Loads environment configuration with defaults for optional values
 * @returns EnvConfig object with all configuration values
 */
export function loadEnvConfig(): EnvConfig {
  // Validate and parse digest time
  let digestTime = process.env.DIGEST_TIME || '07:00';
  if (!isValidTimeFormat(digestTime)) {
    console.warn(`Invalid DIGEST_TIME format "${digestTime}", using default "07:00"`);
    digestTime = '07:00';
  }
  
  // Validate and parse weekly review day
  let weeklyReviewDay = process.env.WEEKLY_REVIEW_DAY || 'sunday';
  if (!isValidDayOfWeek(weeklyReviewDay)) {
    console.warn(`Invalid WEEKLY_REVIEW_DAY "${weeklyReviewDay}", using default "sunday"`);
    weeklyReviewDay = 'sunday';
  }
  
  // Validate and parse weekly review time
  let weeklyReviewTime = process.env.WEEKLY_REVIEW_TIME || '16:00';
  if (!isValidTimeFormat(weeklyReviewTime)) {
    console.warn(`Invalid WEEKLY_REVIEW_TIME format "${weeklyReviewTime}", using default "16:00"`);
    weeklyReviewTime = '16:00';
  }
  
  // Parse stale inbox days
  let staleInboxDays = parseInt(process.env.STALE_INBOX_DAYS || '3', 10);
  if (isNaN(staleInboxDays) || staleInboxDays < 1) {
    console.warn(`Invalid STALE_INBOX_DAYS "${process.env.STALE_INBOX_DAYS}", using default 3`);
    staleInboxDays = 3;
  }
  
  // Parse proactive cron configuration
  // STALE_DAYS - number of days before a project is considered stale (default: 14)
  let staleDays = parseInt(process.env.STALE_DAYS || '14', 10);
  if (isNaN(staleDays) || staleDays < 1) {
    console.warn(`Invalid STALE_DAYS "${process.env.STALE_DAYS}", using default 14`);
    staleDays = 14;
  }

  // SUMMARIZE_BATCH_SIZE - number of messages per summary batch (default: 10)
  let summarizeBatchSize = parseInt(process.env.SUMMARIZE_BATCH_SIZE || '10', 10);
  if (isNaN(summarizeBatchSize) || summarizeBatchSize < 1) {
    console.warn(`Invalid SUMMARIZE_BATCH_SIZE "${process.env.SUMMARIZE_BATCH_SIZE}", using default 10`);
    summarizeBatchSize = 10;
  }
  
  // INACTIVITY_DAYS - number of days of inactivity before nudge (default: 3)
  let inactivityDays = parseInt(process.env.INACTIVITY_DAYS || '3', 10);
  if (isNaN(inactivityDays) || inactivityDays < 1) {
    console.warn(`Invalid INACTIVITY_DAYS "${process.env.INACTIVITY_DAYS}", using default 3`);
    inactivityDays = 3;
  }
  
  // STALE_CHECK_TIME - time to run stale check (default: "09:00")
  let staleCheckTime = process.env.STALE_CHECK_TIME || '09:00';
  if (!isValidTimeFormat(staleCheckTime)) {
    console.warn(`Invalid STALE_CHECK_TIME format "${staleCheckTime}", using default "09:00"`);
    staleCheckTime = '09:00';
  }
  
  // FOLLOWUP_REMINDER_TIME - time to run follow-up reminder (default: "08:00")
  let followupReminderTime = process.env.FOLLOWUP_REMINDER_TIME || '08:00';
  if (!isValidTimeFormat(followupReminderTime)) {
    console.warn(`Invalid FOLLOWUP_REMINDER_TIME format "${followupReminderTime}", using default "08:00"`);
    followupReminderTime = '08:00';
  }
  
  // INACTIVITY_NUDGE_TIME - time to run inactivity nudge (default: "20:00")
  let inactivityNudgeTime = process.env.INACTIVITY_NUDGE_TIME || '20:00';
  if (!isValidTimeFormat(inactivityNudgeTime)) {
    console.warn(`Invalid INACTIVITY_NUDGE_TIME format "${inactivityNudgeTime}", using default "20:00"`);
    inactivityNudgeTime = '20:00';
  }

  // Offline queue configuration
  const offlineQueueEnabled = (process.env.OFFLINE_QUEUE_ENABLED || 'true').toLowerCase() !== 'false';
  let offlineReplayInterval = parseInt(process.env.OFFLINE_QUEUE_REPLAY_INTERVAL_SEC || '60', 10);
  if (isNaN(offlineReplayInterval) || offlineReplayInterval < 5) {
    console.warn(`Invalid OFFLINE_QUEUE_REPLAY_INTERVAL_SEC "${process.env.OFFLINE_QUEUE_REPLAY_INTERVAL_SEC}", using default 60`);
    offlineReplayInterval = 60;
  }
  let offlineProcessingTimeout = parseInt(process.env.OFFLINE_QUEUE_PROCESSING_TIMEOUT_SEC || '300', 10);
  if (isNaN(offlineProcessingTimeout) || offlineProcessingTimeout < 30) {
    console.warn(`Invalid OFFLINE_QUEUE_PROCESSING_TIMEOUT_SEC "${process.env.OFFLINE_QUEUE_PROCESSING_TIMEOUT_SEC}", using default 300`);
    offlineProcessingTimeout = 300;
  }
  let offlineRetryBase = parseInt(process.env.OFFLINE_QUEUE_RETRY_BASE_SEC || '30', 10);
  if (isNaN(offlineRetryBase) || offlineRetryBase < 5) {
    console.warn(`Invalid OFFLINE_QUEUE_RETRY_BASE_SEC "${process.env.OFFLINE_QUEUE_RETRY_BASE_SEC}", using default 30`);
    offlineRetryBase = 30;
  }
  let offlineMaxAttempts = parseInt(process.env.OFFLINE_QUEUE_MAX_ATTEMPTS || '6', 10);
  if (isNaN(offlineMaxAttempts) || offlineMaxAttempts < 1) {
    console.warn(`Invalid OFFLINE_QUEUE_MAX_ATTEMPTS "${process.env.OFFLINE_QUEUE_MAX_ATTEMPTS}", using default 6`);
    offlineMaxAttempts = 6;
  }
  let offlineDedupeTtl = parseInt(process.env.OFFLINE_QUEUE_DEDUPE_TTL_HOURS || '24', 10);
  if (isNaN(offlineDedupeTtl) || offlineDedupeTtl < 1) {
    console.warn(`Invalid OFFLINE_QUEUE_DEDUPE_TTL_HOURS "${process.env.OFFLINE_QUEUE_DEDUPE_TTL_HOURS}", using default 24`);
    offlineDedupeTtl = 24;
  }

  let revisionMaxPerEntry = parseInt(process.env.ENTRY_REVISION_MAX_PER_ENTRY || '50', 10);
  if (isNaN(revisionMaxPerEntry) || revisionMaxPerEntry < 1) {
    console.warn(`Invalid ENTRY_REVISION_MAX_PER_ENTRY "${process.env.ENTRY_REVISION_MAX_PER_ENTRY}", using default 50`);
    revisionMaxPerEntry = 50;
  }

  let revisionMaxDays: number | undefined;
  if (process.env.ENTRY_REVISION_MAX_DAYS) {
    const parsed = parseInt(process.env.ENTRY_REVISION_MAX_DAYS, 10);
    if (isNaN(parsed) || parsed < 1) {
      console.warn(`Invalid ENTRY_REVISION_MAX_DAYS "${process.env.ENTRY_REVISION_MAX_DAYS}", ignoring`);
      revisionMaxDays = undefined;
    } else {
      revisionMaxDays = parsed;
    }
  }

  const focusSearchTerms = (process.env.FOCUS_MUSIC_SEARCH_TERMS || 'deep focus music,focus music,ambient focus,lofi focus')
    .split(',')
    .map((term) => term.trim())
    .filter(Boolean);

  let focusResultsLimit = parseInt(process.env.FOCUS_MUSIC_RESULTS_LIMIT || '10', 10);
  if (isNaN(focusResultsLimit) || focusResultsLimit < 1) {
    console.warn(`Invalid FOCUS_MUSIC_RESULTS_LIMIT "${process.env.FOCUS_MUSIC_RESULTS_LIMIT}", using default 10`);
    focusResultsLimit = 10;
  }
  
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    DATABASE_URL: process.env.DATABASE_URL || '',
    JWT_SECRET: process.env.JWT_SECRET || '',
    DEFAULT_USER_EMAIL: process.env.DEFAULT_USER_EMAIL || '',
    DEFAULT_USER_PASSWORD: process.env.DEFAULT_USER_PASSWORD || '',
    DEFAULT_USER_NAME: process.env.DEFAULT_USER_NAME || undefined,
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
    TIMEZONE: process.env.TIMEZONE || 'Europe/Berlin',
    PORT: parseInt(process.env.PORT || '3000', 10),

    // OpenAI model configuration
    OPENAI_MODEL_CHAT_TOOL_CALL: process.env.OPENAI_MODEL_CHAT_TOOL_CALL || 'gpt-4o-mini',
    OPENAI_MODEL_CHAT_FINAL_RESPONSE: process.env.OPENAI_MODEL_CHAT_FINAL_RESPONSE || 'gpt-4o-mini',
    OPENAI_MODEL_CLASSIFICATION: process.env.OPENAI_MODEL_CLASSIFICATION || 'gpt-4o-mini',
    OPENAI_MODEL_SUMMARIZATION: process.env.OPENAI_MODEL_SUMMARIZATION || 'gpt-4o-mini',
    OPENAI_MODEL_ACTION_EXTRACTION: process.env.OPENAI_MODEL_ACTION_EXTRACTION || 'gpt-4o-mini',
    OPENAI_MODEL_DAILY_TIP: process.env.OPENAI_MODEL_DAILY_TIP || 'gpt-4o-mini',
    OPENAI_MODEL_FOCUS_CONGRATS: process.env.OPENAI_MODEL_FOCUS_CONGRATS || 'gpt-4o-mini',
    OPENAI_MODEL_INTENT_ANALYSIS: process.env.OPENAI_MODEL_INTENT_ANALYSIS || 'gpt-4o-mini',
    OPENAI_MODEL_TOOL_GUARDRAIL: process.env.OPENAI_MODEL_TOOL_GUARDRAIL || 'gpt-4o-mini',
    OPENAI_MODEL_EMBEDDING: process.env.OPENAI_MODEL_EMBEDDING || process.env.EMBEDDING_MODEL || 'text-embedding-3-large',
    
    // Chat configuration
    CONFIDENCE_THRESHOLD: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.6'),
    MAX_VERBATIM_MESSAGES: parseInt(process.env.MAX_VERBATIM_MESSAGES || '15', 10),
    SUMMARIZE_BATCH_SIZE: summarizeBatchSize,
    
    // Digest configuration
    DIGEST_TIME: digestTime,
    WEEKLY_REVIEW_DAY: weeklyReviewDay.toLowerCase(),
    WEEKLY_REVIEW_TIME: weeklyReviewTime,
    STALE_INBOX_DAYS: staleInboxDays,
    
    // Proactive cron configuration
    STALE_DAYS: staleDays,
    INACTIVITY_DAYS: inactivityDays,
    STALE_CHECK_TIME: staleCheckTime,
    FOLLOWUP_REMINDER_TIME: followupReminderTime,
    INACTIVITY_NUDGE_TIME: inactivityNudgeTime,
    
    // Digest email delivery
    DIGEST_RECIPIENT_EMAIL: process.env.DIGEST_RECIPIENT_EMAIL || undefined,
    
    // Skip chat delivery when email is configured (default: true)
    DIGEST_SKIP_CHAT_WHEN_EMAIL: process.env.DIGEST_SKIP_CHAT_WHEN_EMAIL !== 'false',

    // Focus music configuration
    YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || undefined,
    FOCUS_MUSIC_SEARCH_TERMS: focusSearchTerms,
    FOCUS_MUSIC_RESULTS_LIMIT: focusResultsLimit,

    // Offline queue configuration
    OFFLINE_QUEUE_ENABLED: offlineQueueEnabled,
    OFFLINE_QUEUE_REPLAY_INTERVAL_SEC: offlineReplayInterval,
    OFFLINE_QUEUE_PROCESSING_TIMEOUT_SEC: offlineProcessingTimeout,
    OFFLINE_QUEUE_RETRY_BASE_SEC: offlineRetryBase,
    OFFLINE_QUEUE_MAX_ATTEMPTS: offlineMaxAttempts,
    OFFLINE_QUEUE_DEDUPE_TTL_HOURS: offlineDedupeTtl,
    ENTRY_REVISION_MAX_PER_ENTRY: revisionMaxPerEntry,
    ENTRY_REVISION_MAX_DAYS: revisionMaxDays,

    // Web Push Notifications
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || undefined,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || undefined,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT || (process.env.DEFAULT_USER_EMAIL ? `mailto:${process.env.DEFAULT_USER_EMAIL}` : undefined),
  };
}

// Export singleton config instance
let configInstance: EnvConfig | null = null;

export function getConfig(): EnvConfig {
  if (!configInstance) {
    configInstance = loadEnvConfig();
  }
  return configInstance;
}

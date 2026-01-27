/**
 * Environment configuration module
 * Loads and validates environment variables
 */

export interface EnvConfig {
  // Required
  OPENAI_API_KEY: string;
  DATABASE_URL: string;
  API_KEY: string;
  DATA_PATH: string;
  
  // Optional with defaults
  TIMEZONE: string;
  PORT: number;
  
  // Chat configuration (optional with defaults)
  CONFIDENCE_THRESHOLD: number;
  MAX_VERBATIM_MESSAGES: number;
  SUMMARIZE_AFTER_MESSAGES: number;
  
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
}

export class MissingEnvVarError extends Error {
  constructor(varName: string) {
    super(`Required environment variable not set: ${varName}`);
    this.name = 'MissingEnvVarError';
  }
}

const REQUIRED_ENV_VARS = [
  'OPENAI_API_KEY',
  'DATABASE_URL',
  'API_KEY',
  'DATA_PATH'
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
  
  return {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    DATABASE_URL: process.env.DATABASE_URL || '',
    API_KEY: process.env.API_KEY || '',
    DATA_PATH: process.env.DATA_PATH || '/data',
    TIMEZONE: process.env.TIMEZONE || 'Europe/Berlin',
    PORT: parseInt(process.env.PORT || '3000', 10),
    
    // Chat configuration
    CONFIDENCE_THRESHOLD: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.6'),
    MAX_VERBATIM_MESSAGES: parseInt(process.env.MAX_VERBATIM_MESSAGES || '15', 10),
    SUMMARIZE_AFTER_MESSAGES: parseInt(process.env.SUMMARIZE_AFTER_MESSAGES || '20', 10),
    
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
    INACTIVITY_NUDGE_TIME: inactivityNudgeTime
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

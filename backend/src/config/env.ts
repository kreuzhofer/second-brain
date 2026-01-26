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
 * Loads environment configuration with defaults for optional values
 * @returns EnvConfig object with all configuration values
 */
export function loadEnvConfig(): EnvConfig {
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
    SUMMARIZE_AFTER_MESSAGES: parseInt(process.env.SUMMARIZE_AFTER_MESSAGES || '20', 10)
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

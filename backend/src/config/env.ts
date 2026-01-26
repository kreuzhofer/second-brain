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
  CONFIDENCE_THRESHOLD: number;
  PORT: number;
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
    CONFIDENCE_THRESHOLD: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.6'),
    PORT: parseInt(process.env.PORT || '3000', 10)
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

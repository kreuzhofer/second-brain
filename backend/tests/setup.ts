// Jest setup file
import { config } from 'dotenv';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';

// Load environment variables from .env file at the root
config({ path: join(__dirname, '../../.env') });

// Test data directory
export const TEST_DATA_DIR = join(__dirname, '../.test-data');

// Clean up test data before all tests
beforeAll(async () => {
  try {
    await rm(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }
  await mkdir(TEST_DATA_DIR, { recursive: true });
});

// Clean up test data after all tests
afterAll(async () => {
  try {
    await rm(TEST_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }
});

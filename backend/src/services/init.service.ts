import { mkdir, readdir, access, constants } from 'fs/promises';
import { join } from 'path';
import { getConfig } from '../config/env';
import { GitService, getGitService, formatInitCommit } from './git.service';
import { IndexService, getIndexService } from './index.service';
import { Category } from '../types/entry.types';

const CATEGORIES: Category[] = ['people', 'projects', 'ideas', 'admin', 'inbox'];

/**
 * Check if a directory exists
 */
async function directoryExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a directory is empty
 */
async function isDirectoryEmpty(path: string): Promise<boolean> {
  try {
    const files = await readdir(path);
    // Ignore .git directory when checking if empty
    const nonGitFiles = files.filter(f => f !== '.git');
    return nonGitFiles.length === 0;
  } catch {
    return true;
  }
}

/**
 * Initialize the data folder structure
 * Creates category subdirectories, initial index.md, and git repository
 */
export async function initializeDataFolder(dataPath?: string): Promise<void> {
  const config = getConfig();
  const path = dataPath || config.DATA_PATH;
  
  console.log(`Initializing data folder at: ${path}`);

  // Create data folder if it doesn't exist
  if (!await directoryExists(path)) {
    await mkdir(path, { recursive: true });
    console.log('Created data folder');
  }

  // Check if data folder needs initialization
  const isEmpty = await isDirectoryEmpty(path);
  const gitService = getGitService(path);
  const gitInitialized = await gitService.isInitialized();

  if (isEmpty || !gitInitialized) {
    // Create category subdirectories
    for (const category of CATEGORIES) {
      const categoryPath = join(path, category);
      if (!await directoryExists(categoryPath)) {
        await mkdir(categoryPath, { recursive: true });
        console.log(`Created ${category}/ directory`);
      }
    }

    // Initialize git repository if not already initialized
    if (!gitInitialized) {
      await gitService.initialize();
      console.log('Initialized git repository');
    }

    // Create initial index.md
    const indexService = getIndexService(path);
    await indexService.regenerate();
    console.log('Created initial index.md');

    // Create initial commit
    try {
      const commitMessage = formatInitCommit();
      await gitService.commit(commitMessage, ['index.md']);
      console.log('Created initial git commit');
    } catch (error) {
      // Commit might fail if there's nothing to commit (e.g., index already exists)
      console.log('Skipped initial commit (may already exist)');
    }
  } else {
    console.log('Data folder already initialized');
  }
}

/**
 * Verify data folder structure is valid
 */
export async function verifyDataFolder(dataPath?: string): Promise<boolean> {
  const config = getConfig();
  const path = dataPath || config.DATA_PATH;

  // Check data folder exists
  if (!await directoryExists(path)) {
    return false;
  }

  // Check all category folders exist
  for (const category of CATEGORIES) {
    const categoryPath = join(path, category);
    if (!await directoryExists(categoryPath)) {
      return false;
    }
  }

  // Check git is initialized
  const gitService = getGitService(path);
  if (!await gitService.isInitialized()) {
    return false;
  }

  return true;
}

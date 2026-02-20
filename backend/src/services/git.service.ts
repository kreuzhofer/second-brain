import simpleGit, { SimpleGit } from 'simple-git';
import { access, constants } from 'fs/promises';
import { join, resolve } from 'path';
import { Category, Channel } from '../types/entry.types';

/**
 * Custom error for git operations
 */
export class GitNotInitializedError extends Error {
  constructor() {
    super('Git repository not initialized in data folder');
    this.name = 'GitNotInitializedError';
  }
}

export class GitCommitError extends Error {
  constructor(message: string) {
    super(`Git commit failed: ${message}`);
    this.name = 'GitCommitError';
  }
}

/**
 * Git Service for managing version control of the data folder
 */
export class GitService {
  private git: SimpleGit;
  private dataPath: string;

  constructor(dataPath?: string) {
    this.dataPath = dataPath || resolve(process.cwd(), '..', 'memory');
    this.git = simpleGit(this.dataPath);
  }

  /**
   * Check if git repository is initialized
   */
  async isInitialized(): Promise<boolean> {
    try {
      const gitDir = join(this.dataPath, '.git');
      await access(gitDir, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Initialize git repository if not exists
   */
  async initialize(): Promise<void> {
    const initialized = await this.isInitialized();
    if (!initialized) {
      await this.git.init();
      // Configure git user for commits
      await this.git.addConfig('user.email', 'justdo@local');
      await this.git.addConfig('user.name', 'JustDo.so');
    }
  }

  /**
   * Stage files and create a commit
   * @param message Commit message
   * @param files Array of file paths relative to data folder
   * @returns Commit hash
   */
  async commit(message: string, files: string[]): Promise<string> {
    try {
      // Stage the specified files
      for (const file of files) {
        await this.git.add(file);
      }
      
      // Create commit
      const result = await this.git.commit(message);
      
      // Return the commit hash
      return result.commit || '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new GitCommitError(errorMessage);
    }
  }

  /**
   * Stage a deleted file and commit
   * @param message Commit message
   * @param file File path relative to data folder
   * @returns Commit hash
   */
  async commitDelete(message: string, file: string): Promise<string> {
    try {
      await this.git.rm(file);
      const result = await this.git.commit(message);
      return result.commit || '';
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new GitCommitError(errorMessage);
    }
  }
}

// ============================================
// Commit Message Formatters
// ============================================

/**
 * Format commit message for entry creation
 */
export function formatCreateCommit(
  category: Category,
  name: string,
  confidence: number | undefined,
  channel: Channel
): string {
  const confidenceStr = confidence !== undefined ? ` [confidence: ${confidence.toFixed(2)}]` : '';
  return `create(${category}): ${name}${confidenceStr} [via: ${channel}]`;
}

/**
 * Format commit message for entry update
 */
export function formatUpdateCommit(
  category: Category,
  name: string,
  changeSummary: string,
  channel: Channel
): string {
  return `update(${category}): ${name} - ${changeSummary} [via: ${channel}]`;
}

/**
 * Format commit message for entry deletion
 */
export function formatDeleteCommit(
  category: Category,
  name: string,
  channel: Channel
): string {
  return `delete(${category}): ${name} [via: ${channel}]`;
}

/**
 * Format commit message for entry move
 */
export function formatMoveCommit(
  sourceCategory: Category,
  targetCategory: Category,
  name: string,
  channel: Channel
): string {
  return `move: ${sourceCategory} -> ${targetCategory}: ${name} [via: ${channel}]`;
}

/**
 * Format commit message for initial data folder setup
 */
export function formatInitCommit(): string {
  return 'init: Initialize JustDo.so data folder';
}

// Export singleton instance
let gitServiceInstance: GitService | null = null;

export function getGitService(dataPath?: string): GitService {
  if (!gitServiceInstance || dataPath) {
    gitServiceInstance = new GitService(dataPath);
  }
  return gitServiceInstance;
}

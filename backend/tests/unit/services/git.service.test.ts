import { rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import {
  GitService,
  formatCreateCommit,
  formatUpdateCommit,
  formatDeleteCommit,
  formatInitCommit
} from '../../../src/services/git.service';

const TEST_GIT_DIR = join(__dirname, '../../.test-git-data');

describe('GitService', () => {
  let gitService: GitService;

  beforeEach(async () => {
    // Clean up and create fresh test directory
    await rm(TEST_GIT_DIR, { recursive: true, force: true });
    await mkdir(TEST_GIT_DIR, { recursive: true });
    gitService = new GitService(TEST_GIT_DIR);
  });

  afterEach(async () => {
    await rm(TEST_GIT_DIR, { recursive: true, force: true });
  });

  describe('isInitialized', () => {
    it('should return false when git is not initialized', async () => {
      const result = await gitService.isInitialized();
      expect(result).toBe(false);
    });

    it('should return true after initialization', async () => {
      await gitService.initialize();
      const result = await gitService.isInitialized();
      expect(result).toBe(true);
    });
  });

  describe('initialize', () => {
    it('should initialize a new git repository', async () => {
      await gitService.initialize();
      const isInit = await gitService.isInitialized();
      expect(isInit).toBe(true);
    });

    it('should not fail if already initialized', async () => {
      await gitService.initialize();
      await gitService.initialize(); // Should not throw
      const isInit = await gitService.isInitialized();
      expect(isInit).toBe(true);
    });
  });

  describe('commit', () => {
    it('should create a commit and return hash', async () => {
      await gitService.initialize();
      
      // Create a test file
      const testFile = 'test.md';
      await writeFile(join(TEST_GIT_DIR, testFile), '# Test\n\nContent here');
      
      const hash = await gitService.commit('test: add test file', [testFile]);
      
      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBeGreaterThan(0);
    });

    it('should commit multiple files', async () => {
      await gitService.initialize();
      
      // Create test files
      await writeFile(join(TEST_GIT_DIR, 'file1.md'), 'Content 1');
      await writeFile(join(TEST_GIT_DIR, 'file2.md'), 'Content 2');
      
      const hash = await gitService.commit('test: add multiple files', ['file1.md', 'file2.md']);
      
      expect(hash).toBeTruthy();
    });
  });

  describe('commitDelete', () => {
    it('should commit a file deletion', async () => {
      await gitService.initialize();
      
      // Create and commit a file first
      const testFile = 'to-delete.md';
      await writeFile(join(TEST_GIT_DIR, testFile), 'Will be deleted');
      await gitService.commit('test: add file', [testFile]);
      
      // Now delete it
      const hash = await gitService.commitDelete('test: delete file', testFile);
      
      expect(hash).toBeTruthy();
    });
  });
});

describe('Commit Message Formatters', () => {
  describe('formatCreateCommit', () => {
    it('should format create commit message correctly', () => {
      const message = formatCreateCommit('projects', 'My Project', 0.85, 'chat');
      expect(message).toBe('create(projects): My Project [confidence: 0.85] [via: chat]');
    });

    it('should format confidence to 2 decimal places', () => {
      const message = formatCreateCommit('people', 'John Doe', 0.9, 'api');
      expect(message).toBe('create(people): John Doe [confidence: 0.90] [via: api]');
    });

    it('should handle all categories', () => {
      expect(formatCreateCommit('ideas', 'New Idea', 0.75, 'email'))
        .toBe('create(ideas): New Idea [confidence: 0.75] [via: email]');
      expect(formatCreateCommit('admin', 'Task', 0.99, 'chat'))
        .toBe('create(admin): Task [confidence: 0.99] [via: chat]');
      expect(formatCreateCommit('inbox', 'Unknown', 0.45, 'api'))
        .toBe('create(inbox): Unknown [confidence: 0.45] [via: api]');
    });
  });

  describe('formatUpdateCommit', () => {
    it('should format update commit message correctly', () => {
      const message = formatUpdateCommit('projects', 'My Project', 'status: active→done', 'chat');
      expect(message).toBe('update(projects): My Project - status: active→done [via: chat]');
    });

    it('should handle various change summaries', () => {
      const message = formatUpdateCommit('people', 'Jane', 'added follow-up', 'email');
      expect(message).toBe('update(people): Jane - added follow-up [via: email]');
    });
  });

  describe('formatDeleteCommit', () => {
    it('should format delete commit message correctly', () => {
      const message = formatDeleteCommit('admin', 'Old Task', 'api');
      expect(message).toBe('delete(admin): Old Task [via: api]');
    });
  });

  describe('formatInitCommit', () => {
    it('should return the init commit message', () => {
      const message = formatInitCommit();
      expect(message).toBe('init: Initialize Second Brain data folder');
    });
  });
});

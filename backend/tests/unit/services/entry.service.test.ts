import { rm, mkdir, readFile } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';
import {
  EntryService,
  EntryNotFoundError,
  EntryAlreadyExistsError,
  generateSlug
} from '../../../src/services/entry.service';
import { GitService } from '../../../src/services/git.service';
import { IndexService } from '../../../src/services/index.service';

const TEST_ENTRY_DIR = join(__dirname, '../../.test-entry-data');

describe('EntryService', () => {
  let entryService: EntryService;
  let gitService: GitService;
  let indexService: IndexService;

  beforeEach(async () => {
    // Clean up and create fresh test directory with category folders
    await rm(TEST_ENTRY_DIR, { recursive: true, force: true });
    await mkdir(TEST_ENTRY_DIR, { recursive: true });
    await mkdir(join(TEST_ENTRY_DIR, 'people'), { recursive: true });
    await mkdir(join(TEST_ENTRY_DIR, 'projects'), { recursive: true });
    await mkdir(join(TEST_ENTRY_DIR, 'ideas'), { recursive: true });
    await mkdir(join(TEST_ENTRY_DIR, 'admin'), { recursive: true });
    await mkdir(join(TEST_ENTRY_DIR, 'inbox'), { recursive: true });
    
    gitService = new GitService(TEST_ENTRY_DIR);
    await gitService.initialize();
    
    indexService = new IndexService(TEST_ENTRY_DIR);
    entryService = new EntryService(TEST_ENTRY_DIR, gitService, indexService);
  });

  afterEach(async () => {
    await rm(TEST_ENTRY_DIR, { recursive: true, force: true });
  });

  describe('generateSlug', () => {
    it('should convert name to lowercase slug', () => {
      expect(generateSlug('My Project')).toBe('my-project');
    });

    it('should replace special characters with hyphens', () => {
      expect(generateSlug('Hello, World!')).toBe('hello-world');
    });

    it('should remove leading and trailing hyphens', () => {
      expect(generateSlug('  Test Name  ')).toBe('test-name');
    });

    it('should truncate to 50 characters', () => {
      const longName = 'a'.repeat(100);
      expect(generateSlug(longName).length).toBeLessThanOrEqual(50);
    });
  });

  describe('create', () => {
    it('should create a people entry', async () => {
      const result = await entryService.create('people', {
        name: 'John Doe',
        context: 'Test contact',
        source_channel: 'api',
        confidence: 0.9
      });

      expect(result.path).toBe('people/john-doe.md');
      expect(result.category).toBe('people');
      expect(result.entry).toMatchObject({
        name: 'John Doe',
        context: 'Test contact',
        confidence: 0.9
      });
      expect((result.entry as any).id).toBeDefined();
    });

    it('should create a projects entry', async () => {
      const result = await entryService.create('projects', {
        name: 'Test Project',
        next_action: 'Do something',
        source_channel: 'chat',
        confidence: 0.85
      });

      expect(result.path).toBe('projects/test-project.md');
      expect(result.category).toBe('projects');
      expect((result.entry as any).status).toBe('active');
    });

    it('should create an ideas entry', async () => {
      const result = await entryService.create('ideas', {
        name: 'Great Idea',
        one_liner: 'This is a great idea',
        source_channel: 'api',
        confidence: 0.95
      });

      expect(result.path).toBe('ideas/great-idea.md');
      expect(result.category).toBe('ideas');
    });

    it('should create an admin entry', async () => {
      const result = await entryService.create('admin', {
        name: 'Important Task',
        due_date: '2026-02-01',
        source_channel: 'api',
        confidence: 0.99
      });

      expect(result.path).toBe('admin/important-task.md');
      expect((result.entry as any).status).toBe('pending');
    });

    it('should create an inbox entry with timestamp in filename', async () => {
      const result = await entryService.create('inbox', {
        original_text: 'Something to review',
        suggested_category: 'projects',
        suggested_name: 'New Project',
        confidence: 0.45,
        source_channel: 'chat'
      });

      expect(result.path).toMatch(/^inbox\/\d{14}-new-project\.md$/);
      expect((result.entry as any).status).toBe('needs_review');
    });

    it('should throw EntryAlreadyExistsError for duplicate slug', async () => {
      await entryService.create('people', {
        name: 'John Doe',
        context: 'First',
        source_channel: 'api',
        confidence: 0.9
      });

      await expect(
        entryService.create('people', {
          name: 'John Doe',
          context: 'Second',
          source_channel: 'api',
          confidence: 0.9
        })
      ).rejects.toThrow(EntryAlreadyExistsError);
    });

    it('should generate UUID for id field', async () => {
      const result = await entryService.create('people', {
        name: 'Test Person',
        context: '',
        source_channel: 'api',
        confidence: 0.9
      });

      const id = (result.entry as any).id;
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('read', () => {
    it('should read an existing entry', async () => {
      await entryService.create('people', {
        name: 'Jane Doe',
        context: 'Test',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await entryService.read('people/jane-doe.md');

      expect(result.path).toBe('people/jane-doe.md');
      expect((result.entry as any).name).toBe('Jane Doe');
    });

    it('should throw EntryNotFoundError for non-existent entry', async () => {
      await expect(
        entryService.read('people/non-existent.md')
      ).rejects.toThrow(EntryNotFoundError);
    });
  });

  describe('update', () => {
    it('should update entry fields', async () => {
      await entryService.create('people', {
        name: 'Update Test',
        context: 'Original',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await entryService.update('people/update-test.md', {
        context: 'Updated'
      });

      expect((result.entry as any).context).toBe('Updated');
      expect((result.entry as any).name).toBe('Update Test');
    });

    it('should update updated_at timestamp', async () => {
      const created = await entryService.create('people', {
        name: 'Timestamp Test',
        context: '',
        source_channel: 'api',
        confidence: 0.9
      });

      // Wait a bit to ensure timestamp difference
      await new Promise(resolve => setTimeout(resolve, 10));

      const updated = await entryService.update('people/timestamp-test.md', {
        context: 'New context'
      });

      expect(new Date((updated.entry as any).updated_at).getTime())
        .toBeGreaterThan(new Date((created.entry as any).created_at).getTime());
    });

    it('should update last_touched for people entries', async () => {
      await entryService.create('people', {
        name: 'Touch Test',
        context: '',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await entryService.update('people/touch-test.md', {
        context: 'Updated'
      });

      expect((result.entry as any).last_touched).toBeDefined();
    });

    it('should throw EntryNotFoundError for non-existent entry', async () => {
      await expect(
        entryService.update('people/non-existent.md', { context: 'test' })
      ).rejects.toThrow(EntryNotFoundError);
    });

    it('should preserve content section when updating frontmatter', async () => {
      // Create entry with content
      await entryService.create('people', {
        name: 'Content Test',
        context: '',
        source_channel: 'api',
        confidence: 0.9
      });

      // Manually add content to the file
      const filePath = join(TEST_ENTRY_DIR, 'people/content-test.md');
      const fileContent = await readFile(filePath, 'utf-8');
      const { data } = matter(fileContent);
      const newContent = matter.stringify('## Notes\n\nSome important notes here.', data);
      const { writeFile: writeFileFs } = await import('fs/promises');
      await writeFileFs(filePath, newContent);

      // Update frontmatter only
      const result = await entryService.update('people/content-test.md', {
        context: 'Updated context'
      });

      expect(result.content).toContain('Some important notes here');
    });
  });

  describe('delete', () => {
    it('should delete an existing entry', async () => {
      await entryService.create('people', {
        name: 'Delete Test',
        context: '',
        source_channel: 'api',
        confidence: 0.9
      });

      await entryService.delete('people/delete-test.md');

      await expect(
        entryService.read('people/delete-test.md')
      ).rejects.toThrow(EntryNotFoundError);
    });

    it('should throw EntryNotFoundError for non-existent entry', async () => {
      await expect(
        entryService.delete('people/non-existent.md')
      ).rejects.toThrow(EntryNotFoundError);
    });
  });

  describe('list', () => {
    beforeEach(async () => {
      // Create some test entries
      await entryService.create('people', {
        name: 'Person 1',
        context: 'Test 1',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('people', {
        name: 'Person 2',
        context: 'Test 2',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('projects', {
        name: 'Project 1',
        status: 'active',
        next_action: 'Do something',
        source_channel: 'api',
        confidence: 0.85
      });
      await entryService.create('projects', {
        name: 'Project 2',
        status: 'waiting',
        next_action: 'Wait for response',
        source_channel: 'api',
        confidence: 0.85
      });
    });

    it('should list all entries when no category specified', async () => {
      const result = await entryService.list();
      expect(result.length).toBe(4);
    });

    it('should list entries by category', async () => {
      const people = await entryService.list('people');
      expect(people.length).toBe(2);
      expect(people.every(e => e.category === 'people')).toBe(true);

      const projects = await entryService.list('projects');
      expect(projects.length).toBe(2);
    });

    it('should filter by status', async () => {
      const active = await entryService.list('projects', { status: 'active' });
      expect(active.length).toBe(1);
      expect(active[0].name).toBe('Project 1');

      const waiting = await entryService.list('projects', { status: 'waiting' });
      expect(waiting.length).toBe(1);
      expect(waiting[0].name).toBe('Project 2');
    });

    it('should return empty array for empty category', async () => {
      const ideas = await entryService.list('ideas');
      expect(ideas).toEqual([]);
    });
  });
});

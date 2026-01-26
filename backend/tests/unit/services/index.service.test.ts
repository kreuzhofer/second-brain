import { rm, mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import matter from 'gray-matter';
import { IndexService } from '../../../src/services/index.service';

const TEST_INDEX_DIR = join(__dirname, '../../.test-index-data');

describe('IndexService', () => {
  let indexService: IndexService;

  beforeEach(async () => {
    // Clean up and create fresh test directory with category folders
    await rm(TEST_INDEX_DIR, { recursive: true, force: true });
    await mkdir(TEST_INDEX_DIR, { recursive: true });
    await mkdir(join(TEST_INDEX_DIR, 'people'), { recursive: true });
    await mkdir(join(TEST_INDEX_DIR, 'projects'), { recursive: true });
    await mkdir(join(TEST_INDEX_DIR, 'ideas'), { recursive: true });
    await mkdir(join(TEST_INDEX_DIR, 'admin'), { recursive: true });
    await mkdir(join(TEST_INDEX_DIR, 'inbox'), { recursive: true });
    
    indexService = new IndexService(TEST_INDEX_DIR);
  });

  afterEach(async () => {
    await rm(TEST_INDEX_DIR, { recursive: true, force: true });
  });

  describe('regenerate', () => {
    it('should create index.md file', async () => {
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('# Second Brain Index');
    });

    it('should include header with timestamp', async () => {
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('> Last updated:');
    });

    it('should include total entry counts', async () => {
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('> Total entries: 0');
    });
  });

  describe('index structure', () => {
    it('should include People section', async () => {
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('## People');
    });

    it('should include Projects sections', async () => {
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('## Projects – Active');
      expect(content).toContain('## Projects – Waiting/Blocked');
    });

    it('should include Ideas section', async () => {
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('## Ideas');
    });

    it('should include Admin section', async () => {
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('## Admin – Pending');
    });

    it('should include Inbox section', async () => {
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('## Inbox – Needs Review');
    });
  });

  describe('with entries', () => {
    it('should list people entries with correct columns', async () => {
      // Create a people entry
      const peopleEntry = {
        id: 'test-id',
        name: 'John Doe',
        context: 'Test contact',
        follow_ups: [],
        related_projects: [],
        last_touched: '2026-01-20',
        tags: [],
        created_at: '2026-01-15T10:00:00Z',
        updated_at: '2026-01-20T10:00:00Z',
        source_channel: 'api',
        confidence: 0.9
      };
      const content = matter.stringify('', peopleEntry);
      await writeFile(join(TEST_INDEX_DIR, 'people/john-doe.md'), content);

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('## People (1)');
      expect(indexContent).toContain('| Name | Context | Last Touched |');
      expect(indexContent).toContain('[John Doe]');
      expect(indexContent).toContain('Test contact');
    });

    it('should list active projects with correct columns', async () => {
      const projectEntry = {
        id: 'test-id',
        name: 'Test Project',
        status: 'active',
        next_action: 'Do something',
        related_people: [],
        tags: [],
        created_at: '2026-01-15T10:00:00Z',
        updated_at: '2026-01-20T10:00:00Z',
        source_channel: 'api',
        confidence: 0.85
      };
      const content = matter.stringify('', projectEntry);
      await writeFile(join(TEST_INDEX_DIR, 'projects/test-project.md'), content);

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('## Projects – Active (1)');
      expect(indexContent).toContain('| Project | Next Action | Status |');
      expect(indexContent).toContain('[Test Project]');
      expect(indexContent).toContain('Do something');
    });

    it('should list ideas with correct columns', async () => {
      const ideaEntry = {
        id: 'test-id',
        name: 'Great Idea',
        one_liner: 'This is a great idea',
        related_projects: [],
        tags: [],
        created_at: '2026-01-15T10:00:00Z',
        updated_at: '2026-01-20T10:00:00Z',
        source_channel: 'api',
        confidence: 0.95
      };
      const content = matter.stringify('', ideaEntry);
      await writeFile(join(TEST_INDEX_DIR, 'ideas/great-idea.md'), content);

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('## Ideas (1)');
      expect(indexContent).toContain('| Idea | One-liner |');
      expect(indexContent).toContain('[Great Idea]');
      expect(indexContent).toContain('This is a great idea');
    });

    it('should list pending admin tasks with correct columns', async () => {
      const adminEntry = {
        id: 'test-id',
        name: 'Important Task',
        status: 'pending',
        due_date: '2026-02-01',
        tags: [],
        created_at: '2026-01-15T10:00:00Z',
        updated_at: '2026-01-20T10:00:00Z',
        source_channel: 'api',
        confidence: 0.99
      };
      const content = matter.stringify('', adminEntry);
      await writeFile(join(TEST_INDEX_DIR, 'admin/important-task.md'), content);

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('## Admin – Pending (1)');
      expect(indexContent).toContain('| Task | Due |');
      expect(indexContent).toContain('[Important Task]');
      expect(indexContent).toContain('2026-02-01');
    });

    it('should list inbox items with correct columns', async () => {
      const inboxEntry = {
        id: 'test-id',
        original_text: 'Something to review',
        suggested_category: 'projects',
        suggested_name: 'New Project',
        confidence: 0.45,
        status: 'needs_review',
        source_channel: 'chat',
        created_at: '2026-01-26T10:00:00Z'
      };
      const content = matter.stringify('', inboxEntry);
      await writeFile(join(TEST_INDEX_DIR, 'inbox/20260126-new-project.md'), content);

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('## Inbox – Needs Review (1)');
      expect(indexContent).toContain('| Captured | Original Text | Suggested |');
      expect(indexContent).toContain('Something to review');
      expect(indexContent).toContain('projects');
    });

    it('should count entries correctly', async () => {
      // Create multiple entries
      const peopleEntry = matter.stringify('', { id: '1', name: 'Person 1', context: '', follow_ups: [], related_projects: [], last_touched: '2026-01-20', tags: [], created_at: '2026-01-15T10:00:00Z', updated_at: '2026-01-20T10:00:00Z', source_channel: 'api', confidence: 0.9 });
      const projectEntry = matter.stringify('', { id: '2', name: 'Project 1', status: 'active', next_action: '', related_people: [], tags: [], created_at: '2026-01-15T10:00:00Z', updated_at: '2026-01-20T10:00:00Z', source_channel: 'api', confidence: 0.85 });
      const ideaEntry = matter.stringify('', { id: '3', name: 'Idea 1', one_liner: '', related_projects: [], tags: [], created_at: '2026-01-15T10:00:00Z', updated_at: '2026-01-20T10:00:00Z', source_channel: 'api', confidence: 0.95 });

      await writeFile(join(TEST_INDEX_DIR, 'people/person-1.md'), peopleEntry);
      await writeFile(join(TEST_INDEX_DIR, 'projects/project-1.md'), projectEntry);
      await writeFile(join(TEST_INDEX_DIR, 'ideas/idea-1.md'), ideaEntry);

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('> Total entries: 3 (1 people, 1 projects, 1 ideas, 0 admin)');
    });
  });
});

import { resetDatabase } from '../../setup';
import { IndexService } from '../../../src/services/index.service';
import { EntryService } from '../../../src/services/entry.service';

describe('IndexService', () => {
  let indexService: IndexService;
  let entryService: EntryService;

  beforeEach(async () => {
    await resetDatabase();
    indexService = new IndexService();
    entryService = new EntryService();
  });

  describe('regenerate', () => {
    it('should create index content', async () => {
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
      await entryService.create('people', {
        name: 'Sample Person',
        context: 'Context',
        source_channel: 'api',
        confidence: 0.9
      });
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('## People');
    });

    it('should include Projects sections', async () => {
      await entryService.create('projects', {
        name: 'Sample Project',
        status: 'active',
        next_action: 'Next',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('projects', {
        name: 'Waiting Project',
        status: 'waiting',
        next_action: 'Waiting',
        source_channel: 'api',
        confidence: 0.9
      });
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('## Projects – Active');
      expect(content).toContain('## Projects – Waiting');
    });

    it('should include Ideas section', async () => {
      await entryService.create('ideas', {
        name: 'Sample Idea',
        one_liner: 'Idea',
        source_channel: 'api',
        confidence: 0.9
      });
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('## Ideas');
    });

    it('should include Admin section', async () => {
      await entryService.create('admin', {
        name: 'Sample Admin',
        status: 'pending',
        source_channel: 'api',
        confidence: 0.9
      });
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('## Admin – Pending');
    });

    it('should include Inbox section', async () => {
      await entryService.create('inbox', {
        original_text: 'Needs review',
        suggested_category: 'projects',
        suggested_name: 'Sample Inbox',
        confidence: 0.4,
        source_channel: 'api'
      });
      await indexService.regenerate();
      const content = await indexService.getIndexContent();
      expect(content).toContain('## Inbox – Needs Review');
    });
  });

  describe('with entries', () => {
    it('should list people entries with correct columns', async () => {
      await entryService.create('people', {
        name: 'John Doe',
        context: 'Test contact',
        source_channel: 'api',
        confidence: 0.9
      });

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('## People (1)');
      expect(indexContent).toContain('| Name | Context | Last Touched |');
      expect(indexContent).toContain('[John Doe]');
      expect(indexContent).toContain('Test contact');
    });

    it('should list active projects with correct columns', async () => {
      await entryService.create('projects', {
        name: 'Test Project',
        status: 'active',
        next_action: 'Do something',
        source_channel: 'api',
        confidence: 0.85
      });

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('## Projects – Active (1)');
      expect(indexContent).toContain('| Project | Next Action | Status |');
      expect(indexContent).toContain('[Test Project]');
      expect(indexContent).toContain('Do something');
    });

    it('should list ideas with correct columns', async () => {
      await entryService.create('ideas', {
        name: 'Great Idea',
        one_liner: 'This is a great idea',
        source_channel: 'api',
        confidence: 0.95
      });

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('## Ideas (1)');
      expect(indexContent).toContain('| Idea | One-liner |');
      expect(indexContent).toContain('[Great Idea]');
      expect(indexContent).toContain('This is a great idea');
    });

    it('should list pending admin tasks with correct columns', async () => {
      await entryService.create('admin', {
        name: 'Important Task',
        due_date: '2026-02-01',
        source_channel: 'api',
        confidence: 0.99
      });

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('## Admin – Pending (1)');
      expect(indexContent).toContain('| Task | Due |');
      expect(indexContent).toContain('[Important Task]');
      expect(indexContent).toContain('2026-02-01');
    });

    it('should list inbox items with correct columns', async () => {
      await entryService.create('inbox', {
        original_text: 'Something to review',
        suggested_category: 'projects',
        suggested_name: 'New Project',
        confidence: 0.45,
        source_channel: 'chat'
      });

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('## Inbox – Needs Review (1)');
      expect(indexContent).toContain('| Captured | Original Text | Suggested |');
      expect(indexContent).toContain('Something to review');
      expect(indexContent).toContain('projects');
    });

    it('should count entries correctly', async () => {
      await entryService.create('people', {
        name: 'Person 1',
        context: '',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('projects', {
        name: 'Project 1',
        status: 'active',
        next_action: '',
        source_channel: 'api',
        confidence: 0.85
      });
      await entryService.create('ideas', {
        name: 'Idea 1',
        one_liner: '',
        source_channel: 'api',
        confidence: 0.95
      });

      await indexService.regenerate();
      const indexContent = await indexService.getIndexContent();

      expect(indexContent).toContain('> Total entries: 3 (1 people, 1 projects, 1 ideas, 0 admin)');
    });
  });
});

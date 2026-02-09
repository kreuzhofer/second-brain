import { resetDatabase } from '../../setup';
import {
  EntryService,
  EntryNotFoundError,
  EntryAlreadyExistsError,
  generateSlug
} from '../../../src/services/entry.service';

describe('EntryService', () => {
  let entryService: EntryService;

  beforeEach(async () => {
    await resetDatabase();
    entryService = new EntryService();
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

      expect(result.path).toBe('people/john-doe');
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

      expect(result.path).toBe('projects/test-project');
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

      expect(result.path).toBe('ideas/great-idea');
      expect(result.category).toBe('ideas');
    });

    it('should create a task entry from legacy admin category input', async () => {
      const result = await entryService.create('admin', {
        name: 'Important Task',
        due_date: '2026-02-01',
        source_channel: 'api',
        confidence: 0.99
      });

      expect(result.path).toBe('task/important-task');
      expect(result.category).toBe('task');
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

      expect(result.path).toMatch(/^inbox\/\d{8}-\d{6}-new-project$/);
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

      const result = await entryService.read('people/jane-doe');

      expect(result.path).toBe('people/jane-doe');
      expect((result.entry as any).name).toBe('Jane Doe');
    });

    it('should throw EntryNotFoundError for non-existent entry', async () => {
      await expect(
        entryService.read('people/non-existent')
      ).rejects.toThrow(EntryNotFoundError);
    });

    it('should resolve legacy admin path and return canonical task path/category', async () => {
      await entryService.create('admin', {
        name: 'Legacy Task',
        source_channel: 'api',
        confidence: 0.91
      });

      const result = await entryService.read('admin/legacy-task');

      expect(result.path).toBe('task/legacy-task');
      expect(result.category).toBe('task');
      expect((result.entry as any).name).toBe('Legacy Task');
    });
  });

  describe('list', () => {
    it('should list task entries when querying canonical task category', async () => {
      await entryService.create('admin', {
        name: 'Canonical List Task',
        source_channel: 'api',
        confidence: 0.88
      });

      const entries = await entryService.list('task');
      expect(entries.some((entry) => entry.path === 'task/canonical-list-task')).toBe(true);
      expect(entries.some((entry) => entry.category === 'task')).toBe(true);
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

      const result = await entryService.update('people/update-test', {
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

      const updated = await entryService.update('people/timestamp-test', {
        context: 'New context'
      });

      expect(new Date((updated.entry as any).updated_at).getTime())
        .toBeGreaterThanOrEqual(new Date((created.entry as any).created_at).getTime());
    });

    it('should update last_touched for people entries', async () => {
      await entryService.create('people', {
        name: 'Touch Test',
        context: '',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await entryService.update('people/touch-test', {
        context: 'Updated'
      });

      expect((result.entry as any).last_touched).toBeDefined();
    });

    it('should throw EntryNotFoundError for non-existent entry', async () => {
      await expect(
        entryService.update('people/non-existent', { context: 'test' })
      ).rejects.toThrow(EntryNotFoundError);
    });

    it('should preserve content section when updating frontmatter', async () => {
      // Create entry with content
      await entryService.create('people', {
        name: 'Content Test',
        context: '',
        source_channel: 'api',
        confidence: 0.9
      }, 'api', '## Notes\n\nSome important notes here.');

      // Update frontmatter only
      const result = await entryService.update('people/content-test', {
        context: 'Updated context'
      });

      expect(result.content).toContain('Some important notes here');
    });

    describe('body content updates', () => {
      it('should append content to existing body', async () => {
        // Create entry with initial body content
        await entryService.create('people', {
          name: 'Append Test',
          context: '',
          source_channel: 'api',
          confidence: 0.9
        }, 'api', '## Notes\n\nOriginal content.');

        // Append new content
        const result = await entryService.update('people/append-test', {}, 'api', {
          content: 'New appended content.',
          mode: 'append'
        });

        expect(result.content).toContain('Original content.');
        expect(result.content).toContain('New appended content.');
        // Original should come before appended
        expect(result.content.indexOf('Original')).toBeLessThan(result.content.indexOf('New appended'));
      });

      it('should append content to empty body', async () => {
        await entryService.create('people', {
          name: 'Append Empty Test',
          context: '',
          source_channel: 'api',
          confidence: 0.9
        });

        const result = await entryService.update('people/append-empty-test', {}, 'api', {
          content: 'First content.',
          mode: 'append'
        });

        expect(result.content).toBe('First content.');
      });

      it('should replace entire body content', async () => {
        // Create entry with initial body content
        await entryService.create('people', {
          name: 'Replace Test',
          context: '',
          source_channel: 'api',
          confidence: 0.9
        }, 'api', '## Notes\n\nOriginal content to be replaced.');

        // Replace content
        const result = await entryService.update('people/replace-test', {}, 'api', {
          content: '## New Section\n\nCompletely new content.',
          mode: 'replace'
        });

        expect(result.content).not.toContain('Original content');
        expect(result.content).toContain('Completely new content.');
      });

      it('should append to existing section', async () => {
        // Create entry with Notes section
        await entryService.create('people', {
          name: 'Section Append Test',
          context: '',
          source_channel: 'api',
          confidence: 0.9
        }, 'api', '## Notes\n\n- First note');

        // Append to Notes section
        const result = await entryService.update('people/section-append-test', {}, 'api', {
          content: '- Second note',
          mode: 'section',
          section: 'Notes'
        });

        expect(result.content).toContain('- First note');
        expect(result.content).toContain('- Second note');
      });

      it('should create section if it does not exist', async () => {
        // Create entry without Log section
        await entryService.create('people', {
          name: 'Section Create Test',
          context: '',
          source_channel: 'api',
          confidence: 0.9
        }, 'api', '## Notes\n\nSome notes here.');

        // Append to non-existent Log section
        const result = await entryService.update('people/section-create-test', {}, 'api', {
          content: 'First log entry',
          mode: 'section',
          section: 'Log'
        });

        expect(result.content).toContain('## Notes');
        expect(result.content).toContain('## Log');
        // Log section should contain date prefix
        expect(result.content).toMatch(/\d{4}-\d{2}-\d{2}: First log entry/);
      });

      it('should prepend date to Log section entries', async () => {
        // Create entry with Log section
        await entryService.create('people', {
          name: 'Log Date Test',
          context: '',
          source_channel: 'api',
          confidence: 0.9
        }, 'api', '## Log\n\n- 2026-01-01: Previous entry');

        // Append to Log section
        const result = await entryService.update('people/log-date-test', {}, 'api', {
          content: 'New log entry',
          mode: 'section',
          section: 'Log'
        });

        // Should have date prefix in YYYY-MM-DD format
        const today = new Date().toISOString().split('T')[0];
        expect(result.content).toContain(`- ${today}: New log entry`);
        expect(result.content).toContain('- 2026-01-01: Previous entry');
      });

      it('should preserve frontmatter when updating body', async () => {
        await entryService.create('people', {
          name: 'Frontmatter Preserve Test',
          context: 'Important context',
          source_channel: 'api',
          confidence: 0.9
        }, 'api', '## Notes\n\nOriginal notes.');

        const result = await entryService.update('people/frontmatter-preserve-test', {}, 'api', {
          content: 'Additional notes.',
          mode: 'append'
        });

        // Frontmatter should be preserved
        expect((result.entry as any).name).toBe('Frontmatter Preserve Test');
        expect((result.entry as any).context).toBe('Important context');
        expect((result.entry as any).confidence).toBe(0.9);
      });

      it('should throw error for section mode without section name', async () => {
        await entryService.create('people', {
          name: 'Section Error Test',
          context: '',
          source_channel: 'api',
          confidence: 0.9
        });

        await expect(
          entryService.update('people/section-error-test', {}, 'api', {
            content: 'Some content',
            mode: 'section'
            // Missing section name
          })
        ).rejects.toThrow('Section name required for section mode');
      });

      it('should handle section append with multiple sections', async () => {
        // Create entry with multiple sections
        await entryService.create('projects', {
          name: 'Multi Section Test',
          next_action: 'Test',
          source_channel: 'api',
          confidence: 0.9
        }, 'api', '## Notes\n\nProject notes.\n\n## Log\n\n- 2026-01-01: Started');

        // Append to Notes section (not Log)
        const result = await entryService.update('projects/multi-section-test', {}, 'api', {
          content: 'More project notes.',
          mode: 'section',
          section: 'Notes'
        });

        expect(result.content).toContain('Project notes.');
        expect(result.content).toContain('More project notes.');
        expect(result.content).toContain('## Log');
        expect(result.content).toContain('- 2026-01-01: Started');
      });
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

      await entryService.delete('people/delete-test');

      await expect(
        entryService.read('people/delete-test')
      ).rejects.toThrow(EntryNotFoundError);
    });

    it('should throw EntryNotFoundError for non-existent entry', async () => {
      await expect(
        entryService.delete('people/non-existent')
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

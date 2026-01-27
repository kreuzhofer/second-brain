import * as fc from 'fast-check';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { EntryService } from '../../src/services/entry.service';
import { GitService } from '../../src/services/git.service';
import { IndexService } from '../../src/services/index.service';
import { BodyContentUpdate } from '../../src/types/entry.types';

const TEST_PROP_DIR = join(__dirname, '../.test-entry-body-content-data');

/**
 * Feature: entry-content-management
 * Property 1: Entry Creation with Body Content Round-Trip
 * 
 * For any valid entry data and non-empty body content string, creating an entry
 * with body content and then reading it back SHALL return both the original
 * frontmatter fields and the body content unchanged.
 * 
 * **Validates: Requirements 1.6**
 */
describe('Property Tests: Entry Body Content', () => {
  let iterationCounter = 0;

  // Increase timeout for all tests in this suite since git operations can be slow
  jest.setTimeout(60000);

  beforeAll(async () => {
    await rm(TEST_PROP_DIR, { recursive: true, force: true });
    await mkdir(TEST_PROP_DIR, { recursive: true });
  });

  afterAll(async () => {
    // Give a small delay to ensure all file handles are released
    await new Promise(resolve => setTimeout(resolve, 100));
    await rm(TEST_PROP_DIR, { recursive: true, force: true });
  });

  // Helper to create a fresh test environment for each property iteration
  async function createTestEnv(): Promise<{ entryService: EntryService; testDir: string }> {
    iterationCounter++;
    const testDir = join(TEST_PROP_DIR, `iter-${iterationCounter}-${Date.now()}`);
    
    await mkdir(testDir, { recursive: true });
    await mkdir(join(testDir, 'people'), { recursive: true });
    await mkdir(join(testDir, 'projects'), { recursive: true });
    await mkdir(join(testDir, 'ideas'), { recursive: true });
    await mkdir(join(testDir, 'admin'), { recursive: true });
    await mkdir(join(testDir, 'inbox'), { recursive: true });
    
    const gitService = new GitService(testDir);
    await gitService.initialize();
    
    const indexService = new IndexService(testDir);
    const entryService = new EntryService(testDir, gitService, indexService);
    
    return { entryService, testDir };
  }

  // Arbitraries for generating test data
  const channelArb = fc.constantFrom('chat', 'email', 'api') as fc.Arbitrary<'chat' | 'email' | 'api'>;
  const confidenceArb = fc.float({ min: 0, max: 1, noNaN: true });
  
  // Generate safe strings for names (must contain at least one letter for valid slugs)
  const safeStringArb = fc.string({ minLength: 1, maxLength: 30 })
    .filter(s => /[a-zA-Z]/.test(s));

  const tagsArb = fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 });

  // Body content arbitrary - generates markdown-like content
  // Avoid strings that start with '---' as they could be confused with frontmatter
  // Also avoid leading/trailing whitespace since gray-matter trims content
  const bodyContentArb = fc.string({ minLength: 1, maxLength: 500 })
    .filter(s => !s.startsWith('---') && s.trim().length > 0 && s === s.trim());

  // People entry arbitrary
  const peopleInputArb = fc.record({
    name: safeStringArb,
    context: fc.string({ maxLength: 100 }),
    follow_ups: fc.array(fc.string({ maxLength: 50 }), { maxLength: 3 }),
    related_projects: fc.array(fc.string({ maxLength: 30 }), { maxLength: 3 }),
    tags: tagsArb,
    source_channel: channelArb,
    confidence: confidenceArb
  });

  // Projects entry arbitrary
  const projectStatusArb = fc.constantFrom('active', 'waiting', 'blocked', 'someday', 'done') as fc.Arbitrary<'active' | 'waiting' | 'blocked' | 'someday' | 'done'>;
  const projectsInputArb = fc.record({
    name: safeStringArb,
    status: projectStatusArb,
    next_action: fc.string({ maxLength: 100 }),
    related_people: fc.array(fc.string({ maxLength: 30 }), { maxLength: 3 }),
    tags: tagsArb,
    due_date: fc.option(fc.date().map(d => d.toISOString().split('T')[0]), { nil: undefined }),
    source_channel: channelArb,
    confidence: confidenceArb
  });

  // Ideas entry arbitrary
  const ideasInputArb = fc.record({
    name: safeStringArb,
    one_liner: fc.string({ maxLength: 100 }),
    related_projects: fc.array(fc.string({ maxLength: 30 }), { maxLength: 3 }),
    tags: tagsArb,
    source_channel: channelArb,
    confidence: confidenceArb
  });

  // Admin entry arbitrary
  const adminStatusArb = fc.constantFrom('pending', 'done') as fc.Arbitrary<'pending' | 'done'>;
  const adminInputArb = fc.record({
    name: safeStringArb,
    status: adminStatusArb,
    due_date: fc.option(fc.date().map(d => d.toISOString().split('T')[0]), { nil: undefined }),
    tags: tagsArb,
    source_channel: channelArb,
    confidence: confidenceArb
  });

  describe('Property 1: Entry Creation with Body Content Round-Trip', () => {
    /**
     * Feature: entry-content-management, Property 1: Entry Creation with Body Content Round-Trip
     * 
     * For any valid entry data and non-empty body content string, creating an entry
     * with body content and then reading it back SHALL return both the original
     * frontmatter fields and the body content unchanged.
     * 
     * **Validates: Requirements 1.6**
     */
    it('entry with body content round-trips correctly', async () => {
      await fc.assert(
        fc.asyncProperty(adminInputArb, bodyContentArb, async (input, bodyContent) => {
          const { entryService } = await createTestEnv();
          
          const created = await entryService.create('admin', input, undefined, bodyContent);
          const read = await entryService.read(created.path);
          
          // Verify body content is preserved unchanged
          expect(read.content).toBe(bodyContent);
          
          // Verify frontmatter fields
          expect((read.entry as any).name).toBe(input.name);
          expect((read.entry as any).status).toBe(input.status);
          expect((read.entry as any).tags).toEqual(input.tags);
          expect((read.entry as any).id).toBeDefined();
        }),
        { numRuns: 3 }
      );
    });
  });

  /**
   * Feature: entry-content-management, Property 2: Body Append Preserves Existing Content
   * 
   * For any existing entry with body content and any new content string, updating with
   * mode "append" SHALL result in the final body containing the original content
   * followed by the new content.
   * 
   * **Validates: Requirements 2.2**
   */
  describe('Property 2: Body Append Preserves Existing Content', () => {
    it('append mode preserves existing content and adds new content', async () => {
      await fc.assert(
        fc.asyncProperty(
          adminInputArb,
          bodyContentArb,
          bodyContentArb,
          async (input, initialBody, newContent) => {
            // Skip if contents are the same or one contains the other (can't verify order)
            fc.pre(initialBody !== newContent);
            fc.pre(!initialBody.includes(newContent) && !newContent.includes(initialBody));
            
            const { entryService } = await createTestEnv();
            
            // Create entry with initial body content
            const created = await entryService.create('admin', input, undefined, initialBody);
            
            // Update with append mode
            const bodyUpdate: BodyContentUpdate = {
              content: newContent,
              mode: 'append'
            };
            const updated = await entryService.update(created.path, {}, 'api', bodyUpdate);
            
            // Verify the final body contains both original and new content
            expect(updated.content).toContain(initialBody);
            expect(updated.content).toContain(newContent);
            
            // Verify original content comes before new content
            const originalIndex = updated.content.indexOf(initialBody);
            const newIndex = updated.content.indexOf(newContent);
            expect(originalIndex).toBeLessThan(newIndex);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('append to empty body results in just the new content', async () => {
      await fc.assert(
        fc.asyncProperty(
          adminInputArb,
          bodyContentArb,
          async (input, newContent) => {
            const { entryService } = await createTestEnv();
            
            // Create entry with no body content
            const created = await entryService.create('admin', input, undefined, '');
            
            // Update with append mode
            const bodyUpdate: BodyContentUpdate = {
              content: newContent,
              mode: 'append'
            };
            const updated = await entryService.update(created.path, {}, 'api', bodyUpdate);
            
            // Verify the final body is just the new content
            expect(updated.content).toBe(newContent);
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  /**
   * Feature: entry-content-management, Property 3: Body Replace Overwrites Content
   * 
   * For any existing entry with body content and any new content string, updating with
   * mode "replace" SHALL result in the final body containing only the new content.
   * 
   * **Validates: Requirements 2.3**
   */
  describe('Property 3: Body Replace Overwrites Content', () => {
    it('replace mode overwrites existing content completely', async () => {
      await fc.assert(
        fc.asyncProperty(
          adminInputArb,
          bodyContentArb,
          bodyContentArb,
          async (input, initialBody, newContent) => {
            const { entryService } = await createTestEnv();
            
            // Create entry with initial body content
            const created = await entryService.create('admin', input, undefined, initialBody);
            
            // Update with replace mode
            const bodyUpdate: BodyContentUpdate = {
              content: newContent,
              mode: 'replace'
            };
            const updated = await entryService.update(created.path, {}, 'api', bodyUpdate);
            
            // Verify the final body is exactly the new content
            expect(updated.content).toBe(newContent);
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  /**
   * Feature: entry-content-management, Property 4: Section Append Adds to Correct Section
   * 
   * For any existing entry and any section name and content, updating with mode "section"
   * SHALL result in the content appearing under the specified section header. If the
   * section did not exist, it SHALL be created.
   * 
   * **Validates: Requirements 2.4, 2.5**
   */
  describe('Property 4: Section Append Adds to Correct Section', () => {
    // Section name arbitrary - avoid 'Log' as it has special date prefix behavior
    const sectionNameArb = fc.constantFrom('Notes', 'Elaboration', 'Details', 'Summary');
    
    // Content for sections - simple strings without markdown headers
    const sectionContentArb = fc.string({ minLength: 1, maxLength: 100 })
      .filter(s => !s.startsWith('#') && !s.startsWith('---') && s.trim().length > 0);

    it('section mode creates new section when it does not exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          adminInputArb,
          sectionNameArb,
          sectionContentArb,
          async (input, sectionName, sectionContent) => {
            const { entryService } = await createTestEnv();
            
            // Create entry with no body content
            const created = await entryService.create('admin', input, undefined, '');
            
            // Update with section mode
            const bodyUpdate: BodyContentUpdate = {
              content: sectionContent,
              mode: 'section',
              section: sectionName
            };
            const updated = await entryService.update(created.path, {}, 'api', bodyUpdate);
            
            // Verify the section header was created
            expect(updated.content).toContain(`## ${sectionName}`);
            
            // Verify the content appears under the section
            expect(updated.content).toContain(sectionContent);
            
            // Verify content comes after section header
            const headerIndex = updated.content.indexOf(`## ${sectionName}`);
            const contentIndex = updated.content.indexOf(sectionContent);
            expect(headerIndex).toBeLessThan(contentIndex);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('section mode appends to existing section', async () => {
      await fc.assert(
        fc.asyncProperty(
          adminInputArb,
          sectionNameArb,
          sectionContentArb,
          sectionContentArb,
          async (input, sectionName, initialContent, newContent) => {
            // Skip if contents are the same (can't verify order)
            fc.pre(initialContent !== newContent);
            
            const { entryService } = await createTestEnv();
            
            // Create entry with existing section
            const initialBody = `## ${sectionName}\n\n${initialContent}`;
            const created = await entryService.create('admin', input, undefined, initialBody);
            
            // Update with section mode to append
            const bodyUpdate: BodyContentUpdate = {
              content: newContent,
              mode: 'section',
              section: sectionName
            };
            const updated = await entryService.update(created.path, {}, 'api', bodyUpdate);
            
            // Verify both contents are present
            expect(updated.content).toContain(initialContent);
            expect(updated.content).toContain(newContent);
            
            // Verify section header still exists (only once)
            const headerMatches = updated.content.match(new RegExp(`## ${sectionName}`, 'g'));
            expect(headerMatches?.length).toBe(1);
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  /**
   * Feature: entry-content-management, Property 5: Log Entries Get Date Prefix
   * 
   * For any entry and any content string, appending to the "Log" section SHALL prepend
   * the current date in YYYY-MM-DD format to the content.
   * 
   * **Validates: Requirements 2.6**
   */
  describe('Property 5: Log Entries Get Date Prefix', () => {
    // Log content arbitrary - simple strings
    const logContentArb = fc.string({ minLength: 1, maxLength: 100 })
      .filter(s => !s.startsWith('#') && !s.startsWith('---') && !s.startsWith('-') && s.trim().length > 0);

    it('log section entries get date prefix in YYYY-MM-DD format', async () => {
      await fc.assert(
        fc.asyncProperty(
          adminInputArb,
          logContentArb,
          async (input, logContent) => {
            const { entryService } = await createTestEnv();
            
            // Create entry with no body content
            const created = await entryService.create('admin', input, undefined, '');
            
            // Update with section mode for Log
            const bodyUpdate: BodyContentUpdate = {
              content: logContent,
              mode: 'section',
              section: 'Log'
            };
            const updated = await entryService.update(created.path, {}, 'api', bodyUpdate);
            
            // Verify the Log section was created
            expect(updated.content).toContain('## Log');
            
            // Verify the content has date prefix in YYYY-MM-DD format
            const datePattern = /- \d{4}-\d{2}-\d{2}: /;
            expect(updated.content).toMatch(datePattern);
            
            // Verify the original content is present after the date prefix
            expect(updated.content).toContain(logContent);
            
            // Verify the date is today's date
            const today = new Date().toISOString().split('T')[0];
            expect(updated.content).toContain(`- ${today}: ${logContent}`);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('multiple log entries each get their own date prefix', async () => {
      await fc.assert(
        fc.asyncProperty(
          adminInputArb,
          logContentArb,
          logContentArb,
          async (input, firstLog, secondLog) => {
            // Skip if contents are the same
            fc.pre(firstLog !== secondLog);
            
            const { entryService } = await createTestEnv();
            
            // Create entry with no body content
            const created = await entryService.create('admin', input, undefined, '');
            
            // Add first log entry
            const firstUpdate: BodyContentUpdate = {
              content: firstLog,
              mode: 'section',
              section: 'Log'
            };
            await entryService.update(created.path, {}, 'api', firstUpdate);
            
            // Add second log entry
            const secondUpdate: BodyContentUpdate = {
              content: secondLog,
              mode: 'section',
              section: 'Log'
            };
            const updated = await entryService.update(created.path, {}, 'api', secondUpdate);
            
            // Verify both log entries have date prefixes
            const today = new Date().toISOString().split('T')[0];
            expect(updated.content).toContain(`- ${today}: ${firstLog}`);
            expect(updated.content).toContain(`- ${today}: ${secondLog}`);
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  /**
   * Feature: entry-content-management, Property 6: Body Updates Preserve Frontmatter
   * 
   * For any existing entry and any body content update (append, replace, or section mode),
   * the frontmatter fields SHALL remain unchanged except for `updated_at`.
   * 
   * **Validates: Requirements 2.7**
   */
  describe('Property 6: Body Updates Preserve Frontmatter', () => {
    const sectionNameArb = fc.constantFrom('Notes', 'Log', 'Elaboration');
    const updateContentArb = fc.string({ minLength: 1, maxLength: 100 })
      .filter(s => !s.startsWith('#') && !s.startsWith('---') && !s.startsWith('-') && s.trim().length > 0);

    it('body updates preserve all frontmatter fields except updated_at', async () => {
      await fc.assert(
        fc.asyncProperty(
          adminInputArb,
          bodyContentArb,
          updateContentArb,
          async (input, initialBody, newContent) => {
            const { entryService } = await createTestEnv();
            
            const created = await entryService.create('admin', input, undefined, initialBody);
            const originalEntry = created.entry as any;
            
            // Update with append mode
            const bodyUpdate: BodyContentUpdate = {
              content: newContent,
              mode: 'append'
            };
            const updated = await entryService.update(created.path, {}, 'api', bodyUpdate);
            const updatedEntry = updated.entry as any;
            
            // Verify all frontmatter fields are preserved except updated_at
            expect(updatedEntry.id).toBe(originalEntry.id);
            expect(updatedEntry.name).toBe(originalEntry.name);
            expect(updatedEntry.status).toBe(originalEntry.status);
            expect(updatedEntry.tags).toEqual(originalEntry.tags);
            expect(updatedEntry.created_at).toBe(originalEntry.created_at);
            expect(updatedEntry.source_channel).toBe(originalEntry.source_channel);
            expect(updatedEntry.updated_at).toBeDefined();
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

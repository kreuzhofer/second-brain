import * as fc from 'fast-check';
import { EntryService } from '../../src/services/entry.service';
import { resetDatabase } from '../setup';

/**
 * Property 3: Entry Serialization Round-Trip
 * For any valid entry data, creating an entry and then reading it back
 * SHALL produce an entry object equivalent to the original input
 * (with system-generated fields like id, created_at, updated_at added).
 * 
 * Validates: Requirements 5.6, 6.1
 */
describe('Property Tests: Entry Service', () => {
  beforeAll(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  // Arbitraries for generating test data
  const channelArb = fc.constantFrom('chat', 'email', 'api') as fc.Arbitrary<'chat' | 'email' | 'api'>;
  const confidenceArb = fc.float({ min: 0, max: 1, noNaN: true });
  
  // Generate safe strings for names (no special chars that break slugs badly)
  const safeStringArb = fc.string({ minLength: 1, maxLength: 30 })
    .filter(s => /[a-zA-Z]/.test(s)); // Must contain at least one letter

  const tagsArb = fc.array(
    fc.string({ minLength: 1, maxLength: 20 })
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0),
    { maxLength: 5 }
  );

  const normalizeTags = (tags: string[]): string[] =>
    tags.map((tag) => tag.trim()).filter((tag) => tag.length > 0);

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
    due_date: fc.option(
      fc.date({ min: new Date('2000-01-01'), max: new Date('2100-12-31') })
        .map(d => d.toISOString().split('T')[0]),
      { nil: undefined }
    ),
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
    due_date: fc.option(
      fc.date({ min: new Date('2000-01-01'), max: new Date('2100-12-31') })
        .map(d => d.toISOString().split('T')[0]),
      { nil: undefined }
    ),
    tags: tagsArb,
    source_channel: channelArb,
    confidence: confidenceArb
  });

  describe('Property 3: Entry Serialization Round-Trip', () => {
    // Feature: project-setup, Property 3: Entry Serialization Round-Trip
    // For any valid entry data, create then read should return equivalent data

    it('people entries round-trip correctly', async () => {
      await fc.assert(
        fc.asyncProperty(peopleInputArb, async (input) => {
          await resetDatabase();
          const entryService = new EntryService();
          const created = await entryService.create('people', input);
          const read = await entryService.read(created.path);

          // Verify input fields are preserved
          expect((read.entry as any).name).toBe(input.name);
          expect((read.entry as any).context).toBe(input.context);
          expect((read.entry as any).follow_ups).toEqual(input.follow_ups);
          expect((read.entry as any).related_projects).toEqual(input.related_projects);
          expect((read.entry as any).tags).toEqual(normalizeTags(input.tags));
          expect((read.entry as any).source_channel).toBe(input.source_channel);
          
          // Verify system-generated fields exist
          expect((read.entry as any).id).toBeDefined();
          expect((read.entry as any).created_at).toBeDefined();
          expect((read.entry as any).updated_at).toBeDefined();
          expect((read.entry as any).last_touched).toBeDefined();
        }),
        { numRuns: 5 } // Per steering guidelines: DB operations use 3-5 runs
      );
    });

    it('projects entries round-trip correctly', async () => {
      await fc.assert(
        fc.asyncProperty(projectsInputArb, async (input) => {
          await resetDatabase();
          const entryService = new EntryService();
          const created = await entryService.create('projects', input);
          const read = await entryService.read(created.path);

          expect((read.entry as any).name).toBe(input.name);
          expect((read.entry as any).status).toBe(input.status);
          expect((read.entry as any).next_action).toBe(input.next_action);
          expect((read.entry as any).related_people).toEqual(input.related_people);
          expect((read.entry as any).tags).toEqual(normalizeTags(input.tags));
          
          if (input.due_date) {
            expect((read.entry as any).due_date).toBe(input.due_date);
          }
          
          expect((read.entry as any).id).toBeDefined();
          expect((read.entry as any).created_at).toBeDefined();
        }),
        { numRuns: 5 }
      );
    });

    it('ideas entries round-trip correctly', async () => {
      await fc.assert(
        fc.asyncProperty(ideasInputArb, async (input) => {
          await resetDatabase();
          const entryService = new EntryService();
          const created = await entryService.create('ideas', input);
          const read = await entryService.read(created.path);

          expect((read.entry as any).name).toBe(input.name);
          expect((read.entry as any).one_liner).toBe(input.one_liner);
          expect((read.entry as any).related_projects).toEqual(input.related_projects);
          expect((read.entry as any).tags).toEqual(normalizeTags(input.tags));
          expect((read.entry as any).id).toBeDefined();
        }),
        { numRuns: 5 }
      );
    });

    it('admin entries round-trip correctly', async () => {
      await fc.assert(
        fc.asyncProperty(adminInputArb, async (input) => {
          await resetDatabase();
          const entryService = new EntryService();
          const created = await entryService.create('admin', input);
          const read = await entryService.read(created.path);

          expect((read.entry as any).name).toBe(input.name);
          expect((read.entry as any).status).toBe(input.status);
          expect((read.entry as any).tags).toEqual(normalizeTags(input.tags));
          
          if (input.due_date) {
            expect((read.entry as any).due_date).toBe(input.due_date);
          }
          
          expect((read.entry as any).id).toBeDefined();
        }),
        { numRuns: 5 }
      );
    });
  });
});

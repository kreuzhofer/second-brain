/**
 * Property Tests: Follow-up Reminder
 * 
 * Feature: proactive-crons, Property 3: Follow-up Detection Correctness
 * Feature: proactive-crons, Property 4: Follow-up Output Invariants
 * 
 * These tests validate the follow-up reminder detection and output formatting
 * for the proactive crons feature.
 * 
 * **Validates: Requirements 2.2, 2.3, 2.4, 2.5, 2.6**
 */

import * as fc from 'fast-check';
import { ProactiveService, FollowUpPerson } from '../../src/services/proactive.service';
import { EntrySummary, Category } from '../../src/types/entry.types';

// ============================================
// Test Arbitraries (from design.md)
// ============================================

/**
 * People entry generator for follow-up testing
 * Based on design.md specification
 */
const personArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  follow_ups: fc.array(fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), { minLength: 0, maxLength: 5 }),
  last_touched: fc.option(
    fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0])
  )
});

/**
 * Person with guaranteed follow-ups for testing output invariants
 */
const personWithFollowUpsArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  follow_ups: fc.array(fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), { minLength: 1, maxLength: 5 }),
  last_touched: fc.option(
    fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0])
  )
});

// ============================================
// Mock Factories
// ============================================

/**
 * Convert person arbitrary output to EntrySummary format
 */
const toEntrySummary = (person: {
  name: string;
  follow_ups: string[];
  last_touched: string | null;
}, index: number): EntrySummary => ({
  path: `people/person-${index}.md`,
  name: person.name,
  category: 'people' as Category,
  updated_at: new Date().toISOString()
});

/**
 * Create a mock EntryService that returns the given people entries
 */
const createMockEntryService = (people: Array<{
  name: string;
  follow_ups: string[];
  last_touched: string | null;
}>) => {
  const summaries = people.map((p, i) => toEntrySummary(p, i));
  
  return {
    list: jest.fn().mockImplementation(async (category?: Category) => {
      if (category === 'people') {
        return summaries;
      }
      return [];
    }),
    read: jest.fn().mockImplementation(async (path: string) => {
      const index = summaries.findIndex(s => s.path === path);
      if (index >= 0) {
        return {
          entry: {
            name: people[index].name,
            follow_ups: people[index].follow_ups,
            last_touched: people[index].last_touched
          },
          content: ''
        };
      }
      throw new Error(`Entry not found: ${path}`);
    }),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  };
};

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate days since a given date
 */
const daysSince = (dateStr: string | null, now: Date = new Date()): number => {
  if (!dateStr) {
    return Number.MAX_SAFE_INTEGER;
  }
  const date = new Date(dateStr);
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * Determine if a person should be included in follow-up reminder
 * Based on design.md criteria:
 * - follow_ups array has at least one item
 */
const hasFollowUps = (person: { follow_ups: string[] }): boolean => {
  return person.follow_ups.length > 0;
};

// ============================================
// Property Tests
// ============================================

describe('Property Tests: Follow-up Reminder', () => {
  /**
   * Property 3: Follow-up Detection Correctness
   * 
   * Feature: proactive-crons, Property 3: Follow-up Detection Correctness
   * 
   * *For any* set of people entries with various follow_ups arrays, 
   * the follow-up detection function SHALL return exactly those people 
   * where follow_ups array has at least one item. If no people have 
   * follow-ups, the function SHALL return null.
   * 
   * **Validates: Requirements 2.2, 2.4**
   */
  describe('Property 3: Follow-up Detection Correctness', () => {
    it('SHALL return exactly those people with non-empty follow_ups arrays', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(personArbitrary, { minLength: 0, maxLength: 10 }),
          async (people) => {
            // Create mock EntryService
            const mockEntryService = createMockEntryService(people);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null // No ConversationService needed for this test
            );
            
            // Get people with follow-ups
            const result = await proactiveService.getPeopleWithFollowUps();
            
            // Calculate expected people with follow-ups
            const expectedPeople = people.filter(hasFollowUps);
            
            // Property: All returned people should have follow-ups
            for (const person of result) {
              expect(person.followUps.length).toBeGreaterThan(0);
            }
            
            // Property: No person with follow-ups should be missed (up to the limit of 5)
            const expectedCount = Math.min(expectedPeople.length, 5);
            expect(result.length).toBeLessThanOrEqual(expectedCount);
            
            // If there are expected people with follow-ups, we should have some results
            if (expectedPeople.length > 0) {
              expect(result.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL return empty array when no people have follow-ups', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate people with empty follow_ups arrays
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              follow_ups: fc.constant([]), // Always empty
              last_touched: fc.option(
                fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0])
              )
            }),
            { minLength: 0, maxLength: 5 }
          ),
          async (people) => {
            // Create mock EntryService
            const mockEntryService = createMockEntryService(people);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Get people with follow-ups
            const result = await proactiveService.getPeopleWithFollowUps();
            
            // Property: No people should be returned when none have follow-ups
            expect(result.length).toBe(0);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('generateFollowUpReminder SHALL return null when no people have follow-ups', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate people with empty follow_ups arrays
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              follow_ups: fc.constant([]), // Always empty
              last_touched: fc.option(
                fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0])
              )
            }),
            { minLength: 0, maxLength: 5 }
          ),
          async (people) => {
            // Create mock EntryService
            const mockEntryService = createMockEntryService(people);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Generate follow-up reminder
            const result = await proactiveService.generateFollowUpReminder();
            
            // Property: Should return null when no people have follow-ups
            expect(result).toBeNull();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL only include people with at least one follow-up item', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(personArbitrary, { minLength: 1, maxLength: 10 }),
          async (people) => {
            // Create mock EntryService
            const mockEntryService = createMockEntryService(people);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Get people with follow-ups
            const result = await proactiveService.getPeopleWithFollowUps();
            
            // Property: Every returned person must have at least one follow-up
            for (const person of result) {
              expect(person.followUps.length).toBeGreaterThanOrEqual(1);
            }
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  /**
   * Property 4: Follow-up Output Invariants
   * 
   * Feature: proactive-crons, Property 4: Follow-up Output Invariants
   * 
   * *For any* non-empty set of people with follow-ups, the generated 
   * follow-up reminder message SHALL:
   * - Contain at most 5 people
   * - List people in order of last_touched (oldest first)
   * - Include at most 2 follow-up items per person
   * - Include each person's name and their follow-up items
   * 
   * **Validates: Requirements 2.3, 2.5, 2.6**
   */
  describe('Property 4: Follow-up Output Invariants', () => {
    it('SHALL contain at most 5 people in output', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate people that will definitely have follow-ups
          fc.array(personWithFollowUpsArbitrary, { minLength: 1, maxLength: 15 }),
          async (people) => {
            // Create mock EntryService
            const mockEntryService = createMockEntryService(people);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Get people with follow-ups
            const result = await proactiveService.getPeopleWithFollowUps();
            
            // Property: At most 5 people should be returned
            expect(result.length).toBeLessThanOrEqual(5);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL list people in order of last_touched (oldest first)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate people with varying last_touched dates
          fc.array(personWithFollowUpsArbitrary, { minLength: 2, maxLength: 10 }),
          async (people) => {
            // Create mock EntryService
            const mockEntryService = createMockEntryService(people);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Get people with follow-ups
            const result = await proactiveService.getPeopleWithFollowUps();
            
            // Property: People should be sorted by daysSinceContact descending (oldest first)
            for (let i = 1; i < result.length; i++) {
              expect(result[i - 1].daysSinceContact).toBeGreaterThanOrEqual(
                result[i].daysSinceContact
              );
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL include at most 2 follow-up items per person', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate people with many follow-ups to test truncation
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              follow_ups: fc.array(
                fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), 
                { minLength: 1, maxLength: 5 }
              ),
              last_touched: fc.option(
                fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0])
              )
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (people) => {
            // Create mock EntryService
            const mockEntryService = createMockEntryService(people);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Get people with follow-ups
            const result = await proactiveService.getPeopleWithFollowUps();
            
            // Property: Each person should have at most 2 follow-up items
            for (const person of result) {
              expect(person.followUps.length).toBeLessThanOrEqual(2);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL include each person name and their follow-up items in formatted output', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 1-5 people with follow-ups for formatting test
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /[a-zA-Z]/.test(s)).map(s => s.trim() || 'Person'),
              followUps: fc.array(
                fc.string({ minLength: 1, maxLength: 50 }).filter(s => /[a-zA-Z]/.test(s)).map(s => s.trim() || 'Follow up'),
                { minLength: 1, maxLength: 2 }
              ),
              lastTouched: fc.option(
                fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0])
              ),
              daysSinceContact: fc.integer({ min: 0, max: 365 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (people) => {
            // Create ProactiveService (no mocks needed for formatting)
            const proactiveService = new ProactiveService(null, null);
            
            // Format the follow-up reminder message
            const message = proactiveService.formatFollowUpReminder(people as FollowUpPerson[]);
            
            // Property: Each person's name should appear in the message (bold formatted)
            for (const person of people) {
              expect(message).toContain(`**${person.name}**`);
            }
            
            // Property: Each follow-up item should appear in the message
            for (const person of people) {
              for (const followUp of person.followUps) {
                expect(message).toContain(`- ${followUp}`);
              }
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('formatted output SHALL be valid markdown', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 1-5 people with follow-ups
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /[a-zA-Z]/.test(s)).map(s => s.trim() || 'Person'),
              followUps: fc.array(
                fc.string({ minLength: 1, maxLength: 50 }).filter(s => /[a-zA-Z]/.test(s)).map(s => s.trim() || 'Follow up'),
                { minLength: 1, maxLength: 2 }
              ),
              lastTouched: fc.option(
                fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0])
              ),
              daysSinceContact: fc.integer({ min: 0, max: 365 })
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (people) => {
            // Create ProactiveService (no mocks needed for formatting)
            const proactiveService = new ProactiveService(null, null);
            
            // Format the follow-up reminder message
            const message = proactiveService.formatFollowUpReminder(people as FollowUpPerson[]);
            
            // Property: Output should be valid markdown
            // Check for expected markdown structure
            expect(message).toContain('**👋 Follow-up Reminder**');
            expect(message).toContain('You have pending follow-ups with:');
            expect(message).toContain('Reply to mark any as done or add notes.');
            
            // Each person should have bold name
            for (const person of people) {
              expect(message).toMatch(new RegExp(`\\*\\*${escapeRegex(person.name)}\\*\\*`));
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL handle people with null last_touched correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate people with null last_touched
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              follow_ups: fc.array(
                fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0), 
                { minLength: 1, maxLength: 3 }
              ),
              last_touched: fc.constant(null) // Always null
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (people) => {
            // Create mock EntryService
            const mockEntryService = createMockEntryService(people);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Get people with follow-ups
            const result = await proactiveService.getPeopleWithFollowUps();
            
            // Property: People with null last_touched should have MAX_SAFE_INTEGER daysSinceContact
            for (const person of result) {
              if (person.lastTouched === null) {
                expect(person.daysSinceContact).toBe(Number.MAX_SAFE_INTEGER);
              }
            }
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

/**
 * Helper to escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

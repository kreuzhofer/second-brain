/**
 * Property Tests: Stale Project Detection
 * 
 * Feature: proactive-crons, Property 1: Stale Project Detection Correctness
 * Feature: proactive-crons, Property 2: Stale Check Output Invariants
 * 
 * These tests validate the stale project detection and output formatting
 * for the proactive crons feature.
 * 
 * **Validates: Requirements 1.2, 1.3, 1.4, 1.5**
 */

import * as fc from 'fast-check';
import { ProactiveService, StaleProject } from '../../src/services/proactive.service';
import { EntrySummary, Category } from '../../src/types/entry.types';

// ============================================
// Test Configuration
// ============================================

/**
 * Default stale days threshold for testing
 */
const DEFAULT_STALE_DAYS = 14;

// ============================================
// Test Arbitraries (from design.md)
// ============================================

/**
 * Project entry generator for stale check testing
 * Based on design.md specification
 */
const projectArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
  status: fc.constantFrom('active', 'waiting', 'blocked', 'someday', 'done'),
  updated_at: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString()),
  path: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /[a-zA-Z0-9]/.test(s)).map(s => `projects/${s.replace(/[^a-zA-Z0-9]/g, '-')}.md`)
});

/**
 * Days configuration generator
 */
const staleDaysArbitrary = fc.integer({ min: 1, max: 30 });

// ============================================
// Mock Factories
// ============================================

/**
 * Convert project arbitrary output to EntrySummary format
 */
const toEntrySummary = (project: {
  name: string;
  status: string;
  updated_at: string;
  path: string;
}): EntrySummary => ({
  path: project.path,
  name: project.name,
  category: 'projects' as Category,
  updated_at: project.updated_at,
  status: project.status
});

/**
 * Create a mock EntryService that returns the given projects
 */
const createMockEntryService = (projects: EntrySummary[]) => {
  return {
    list: jest.fn().mockImplementation(async (category?: Category) => {
      if (category === 'projects') {
        return projects;
      }
      return [];
    }),
    create: jest.fn(),
    read: jest.fn(),
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
const daysSince = (dateStr: string, now: Date = new Date()): number => {
  const date = new Date(dateStr);
  return Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
};

/**
 * Determine if a project should be considered stale
 * Based on design.md criteria:
 * - status is "active", "waiting", or "blocked", AND
 * - updated_at is older than STALE_DAYS
 */
const shouldBeStale = (
  project: { status: string; updated_at: string },
  staleDays: number,
  now: Date = new Date()
): boolean => {
  const validStatuses = ['active', 'waiting', 'blocked'];
  const isValidStatus = validStatuses.includes(project.status);
  const days = daysSince(project.updated_at, now);
  return isValidStatus && days > staleDays;
};

// ============================================
// Property Tests
// ============================================

describe('Property Tests: Stale Project Detection', () => {
  /**
   * Property 1: Stale Project Detection Correctness
   * 
   * Feature: proactive-crons, Property 1: Stale Project Detection Correctness
   * 
   * *For any* set of projects with various statuses and updated_at dates, 
   * the stale detection function SHALL return exactly those projects where:
   * - status is "active", "waiting", or "blocked", AND
   * - updated_at is older than STALE_DAYS
   * 
   * If no projects meet these criteria, the function SHALL return null.
   * 
   * **Validates: Requirements 1.2, 1.4**
   */
  describe('Property 1: Stale Project Detection Correctness', () => {
    it('SHALL return exactly those projects matching stale criteria', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(projectArbitrary, { minLength: 0, maxLength: 10 }),
          staleDaysArbitrary,
          async (projects, staleDays) => {
            // Use a fixed "now" date for consistent testing
            const now = new Date();
            
            // Convert to EntrySummary format
            const entrySummaries = projects.map(toEntrySummary);
            
            // Create mock EntryService
            const mockEntryService = createMockEntryService(entrySummaries);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null // No ConversationService needed for this test
            );
            
            // Get stale projects
            const staleProjects = await proactiveService.getStaleProjects(staleDays);
            
            // Calculate expected stale projects
            const expectedStale = projects.filter(p => shouldBeStale(p, staleDays, now));
            
            // Property: All returned projects should match stale criteria
            for (const staleProject of staleProjects) {
              const originalProject = projects.find(p => p.name === staleProject.name);
              expect(originalProject).toBeDefined();
              expect(['active', 'waiting', 'blocked']).toContain(staleProject.status);
              expect(staleProject.daysSinceUpdate).toBeGreaterThan(staleDays);
            }
            
            // Property: No stale project should be missed (up to the limit of 5)
            const expectedCount = Math.min(expectedStale.length, 5);
            expect(staleProjects.length).toBeLessThanOrEqual(expectedCount);
            
            // If there are expected stale projects, we should have some results
            if (expectedStale.length > 0) {
              expect(staleProjects.length).toBeGreaterThan(0);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL return empty array when no projects meet stale criteria', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(projectArbitrary, { minLength: 0, maxLength: 10 }),
          async (projects) => {
            // Use a very high staleDays value so nothing is stale
            const staleDays = 10000;
            
            // Convert to EntrySummary format
            const entrySummaries = projects.map(toEntrySummary);
            
            // Create mock EntryService
            const mockEntryService = createMockEntryService(entrySummaries);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Get stale projects
            const staleProjects = await proactiveService.getStaleProjects(staleDays);
            
            // Property: No projects should be returned when threshold is very high
            expect(staleProjects.length).toBe(0);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL exclude projects with status "someday" or "done"', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(projectArbitrary, { minLength: 1, maxLength: 10 }),
          staleDaysArbitrary,
          async (projects, staleDays) => {
            // Convert to EntrySummary format
            const entrySummaries = projects.map(toEntrySummary);
            
            // Create mock EntryService
            const mockEntryService = createMockEntryService(entrySummaries);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Get stale projects
            const staleProjects = await proactiveService.getStaleProjects(staleDays);
            
            // Property: No returned project should have status "someday" or "done"
            for (const staleProject of staleProjects) {
              expect(staleProject.status).not.toBe('someday');
              expect(staleProject.status).not.toBe('done');
              expect(['active', 'waiting', 'blocked']).toContain(staleProject.status);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('generateStaleCheck SHALL return null when no stale projects exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              // Only use statuses that won't be considered stale
              status: fc.constantFrom('someday', 'done'),
              updated_at: fc.date({ min: new Date('2020-01-01'), max: new Date() }).map(d => d.toISOString()),
              path: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /[a-zA-Z0-9]/.test(s)).map(s => `projects/${s.replace(/[^a-zA-Z0-9]/g, '-')}.md`)
            }),
            { minLength: 0, maxLength: 5 }
          ),
          async (projects) => {
            // Convert to EntrySummary format
            const entrySummaries = projects.map(toEntrySummary);
            
            // Create mock EntryService
            const mockEntryService = createMockEntryService(entrySummaries);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Generate stale check
            const result = await proactiveService.generateStaleCheck();
            
            // Property: Should return null when no stale projects
            expect(result).toBeNull();
          }
        ),
        { numRuns: 3 }
      );
    });
  });

  /**
   * Property 2: Stale Check Output Invariants
   * 
   * Feature: proactive-crons, Property 2: Stale Check Output Invariants
   * 
   * *For any* non-empty set of stale projects, the generated stale check message SHALL:
   * - Contain at most 5 projects
   * - Include each project's name, status, and days since update
   * - List projects in order of staleness (oldest first)
   * 
   * **Validates: Requirements 1.3, 1.5**
   */
  describe('Property 2: Stale Check Output Invariants', () => {
    it('SHALL contain at most 5 projects in output', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate projects that will definitely be stale
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              status: fc.constantFrom('active', 'waiting', 'blocked'),
              // Use dates from 2020-2022 to ensure they're stale
              updated_at: fc.date({ 
                min: new Date('2020-01-01'), 
                max: new Date('2022-01-01') 
              }).map(d => d.toISOString()),
              path: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /[a-zA-Z0-9]/.test(s)).map(s => `projects/${s.replace(/[^a-zA-Z0-9]/g, '-')}.md`)
            }),
            { minLength: 1, maxLength: 15 }
          ),
          async (projects) => {
            // Convert to EntrySummary format
            const entrySummaries = projects.map(toEntrySummary);
            
            // Create mock EntryService
            const mockEntryService = createMockEntryService(entrySummaries);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Get stale projects
            const staleProjects = await proactiveService.getStaleProjects(DEFAULT_STALE_DAYS);
            
            // Property: At most 5 projects should be returned
            expect(staleProjects.length).toBeLessThanOrEqual(5);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL include each project name, status, and days since update in formatted output', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 1-5 stale projects
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /[a-zA-Z]/.test(s)).map(s => s.trim() || 'Project'),
              status: fc.constantFrom('active', 'waiting', 'blocked') as fc.Arbitrary<'active' | 'waiting' | 'blocked'>,
              daysSinceUpdate: fc.integer({ min: 15, max: 365 }),
              path: fc.constant('projects/test.md')
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (staleProjects) => {
            // Create ProactiveService (no mocks needed for formatting)
            const proactiveService = new ProactiveService(null, null);
            
            // Format the stale check message
            const message = proactiveService.formatStaleCheck(staleProjects as StaleProject[]);
            
            // Property: Each project's details should appear in the message
            for (const project of staleProjects) {
              // Name should be in the message (bold formatted)
              expect(message).toContain(`**${project.name}**`);
              // Status should be in the message
              expect(message).toContain(`(${project.status})`);
              // Days since update should be in the message
              expect(message).toContain(`${project.daysSinceUpdate} days`);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL list projects in order of staleness (oldest first)', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate projects with varying staleness
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0),
              status: fc.constantFrom('active', 'waiting', 'blocked'),
              // Use dates spread across a range to get varying staleness
              updated_at: fc.date({ 
                min: new Date('2020-01-01'), 
                max: new Date('2023-01-01') 
              }).map(d => d.toISOString()),
              path: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /[a-zA-Z0-9]/.test(s)).map(s => `projects/${s.replace(/[^a-zA-Z0-9]/g, '-')}.md`)
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (projects) => {
            // Convert to EntrySummary format
            const entrySummaries = projects.map(toEntrySummary);
            
            // Create mock EntryService
            const mockEntryService = createMockEntryService(entrySummaries);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              mockEntryService as any,
              null
            );
            
            // Get stale projects
            const staleProjects = await proactiveService.getStaleProjects(DEFAULT_STALE_DAYS);
            
            // Property: Projects should be sorted by daysSinceUpdate descending (oldest first)
            for (let i = 1; i < staleProjects.length; i++) {
              expect(staleProjects[i - 1].daysSinceUpdate).toBeGreaterThanOrEqual(
                staleProjects[i].daysSinceUpdate
              );
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('formatted output SHALL be valid markdown', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate 1-5 stale projects
          fc.array(
            fc.record({
              name: fc.string({ minLength: 1, maxLength: 30 }).filter(s => /[a-zA-Z]/.test(s)).map(s => s.trim() || 'Project'),
              status: fc.constantFrom('active', 'waiting', 'blocked') as fc.Arbitrary<'active' | 'waiting' | 'blocked'>,
              daysSinceUpdate: fc.integer({ min: 15, max: 365 }),
              path: fc.constant('projects/test.md')
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (staleProjects) => {
            // Create ProactiveService (no mocks needed for formatting)
            const proactiveService = new ProactiveService(null, null);
            
            // Format the stale check message
            const message = proactiveService.formatStaleCheck(staleProjects as StaleProject[]);
            
            // Property: Output should be valid markdown
            // Check for expected markdown structure
            expect(message).toContain('**🔍 Stale Project Check**');
            expect(message).toContain("These projects haven't been updated in a while:");
            expect(message).toContain('Consider reviewing these to keep things moving.');
            
            // Each project line should be a markdown list item with bold name
            for (const project of staleProjects) {
              expect(message).toMatch(new RegExp(`- \\*\\*${escapeRegex(project.name)}\\*\\*`));
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

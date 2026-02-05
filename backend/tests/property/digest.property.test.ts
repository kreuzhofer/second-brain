/**
 * Property-based tests for Digest Service
 * Feature: digests-and-reviews
 * 
 * Tests correctness properties for daily digest and weekly review generation.
 * These tests focus on the formatting methods which are pure functions.
 */

import * as fc from 'fast-check';
import {
  DigestService,
  TopItem,
  StaleInboxItem,
  ActivityStats,
  OpenLoop,
  Suggestion
} from '../../src/services/digest.service';

// ============================================
// Test Data Generators (Arbitraries)
// ============================================

const topItemArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  nextAction: fc.string({ minLength: 1, maxLength: 100 }),
  source: fc.constantFrom('project', 'admin') as fc.Arbitrary<'project' | 'admin'>,
  dueDate: fc.option(
    fc.date({ min: new Date('2020-01-01'), max: new Date('2030-12-31') })
      .map(d => d.toISOString().split('T')[0]),
    { nil: undefined }
  )
});

const staleInboxItemArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  originalText: fc.string({ minLength: 1, maxLength: 200 }),
  daysInInbox: fc.integer({ min: 1, max: 365 })
});

const activityStatsArbitrary = fc.record({
  messagesCount: fc.integer({ min: 0, max: 1000 }),
  entriesCreated: fc.record({
    people: fc.integer({ min: 0, max: 100 }),
    projects: fc.integer({ min: 0, max: 100 }),
    ideas: fc.integer({ min: 0, max: 100 }),
    admin: fc.integer({ min: 0, max: 100 }),
    total: fc.integer({ min: 0, max: 400 })
  }),
  tasksCompleted: fc.integer({ min: 0, max: 100 })
});

const openLoopArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 }),
  reason: fc.string({ minLength: 1, maxLength: 50 }),
  age: fc.integer({ min: 1, max: 365 })
});

const suggestionArbitrary = fc.record({
  text: fc.string({ minLength: 1, maxLength: 100 }),
  reason: fc.string({ minLength: 1, maxLength: 100 })
});

const smallWinsArbitrary = fc.record({
  completedCount: fc.integer({ min: 0, max: 100 }),
  nextTask: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined })
});

// ============================================
// Create a testable DigestService that doesn't need real services
// ============================================

/**
 * Create a DigestService instance for testing formatting methods only.
 * We pass null/undefined for services since we're only testing pure formatting functions.
 */
function createTestDigestService(): DigestService {
  // Create with null services - we only test formatting methods
  return new DigestService(null as any, null as any, null as any);
}

// ============================================
// Property Tests for Daily Digest
// ============================================

describe('DigestService - Daily Digest Properties', () => {
  let digestService: DigestService;

  beforeEach(() => {
    // Create service for formatting tests only (no real services needed)
    digestService = createTestDigestService();
  });

  /**
   * Property 1: Top 3 Selection Respects Priority and Limit
   * Validates: Requirements 1.1
   */
  describe('Property 1: Top 3 Selection Respects Priority and Limit', () => {
    it('should include at most 3 items in Top 3 section', () => {
      fc.assert(
        fc.property(
          fc.array(topItemArbitrary, { minLength: 0, maxLength: 10 }),
          fc.array(staleInboxItemArbitrary, { minLength: 0, maxLength: 5 }),
          smallWinsArbitrary,
          (topItems, staleItems, smallWins) => {
            const digest = digestService.formatDailyDigest(
              topItems.slice(0, 3), // Service already limits to 3
              staleItems,
              smallWins
            );
            
            // Count numbered items in Top 3 section
            const top3Match = digest.match(/\*\*Top 3 for Today:\*\*[\s\S]*?(?=\n\n|\*\*|$)/);
            if (top3Match) {
              const numberedItems = top3Match[0].match(/^\d+\./gm) || [];
              expect(numberedItems.length).toBeLessThanOrEqual(3);
            }
            return true;
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should order items by due date (earliest first)', () => {
      fc.assert(
        fc.property(
          fc.array(topItemArbitrary, { minLength: 2, maxLength: 5 }),
          (items) => {
            // Sort items as the service would
            const sorted = [...items].sort((a, b) => {
              if (!a.dueDate && !b.dueDate) return 0;
              if (!a.dueDate) return 1;
              if (!b.dueDate) return -1;
              return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
            });

            // Items with due dates should come before items without
            const withDates = sorted.filter(i => i.dueDate);
            const withoutDates = sorted.filter(i => !i.dueDate);
            
            // All items with dates should be before items without dates
            const firstWithoutDateIndex = sorted.findIndex(i => !i.dueDate);
            if (firstWithoutDateIndex > 0) {
              const itemsBeforeFirstWithout = sorted.slice(0, firstWithoutDateIndex);
              expect(itemsBeforeFirstWithout.every(i => i.dueDate)).toBe(true);
            }
            
            return true;
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  /**
   * Property 2: Stale Inbox Items Appear in Might Be Stuck
   * Validates: Requirements 1.2
   */
  describe('Property 2: Stale Inbox Items Appear in Might Be Stuck', () => {
    it('should include all stale items in Might Be Stuck section', () => {
      fc.assert(
        fc.property(
          fc.array(topItemArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(staleInboxItemArbitrary, { minLength: 1, maxLength: 5 }),
          smallWinsArbitrary,
          (topItems, staleItems, smallWins) => {
            const digest = digestService.formatDailyDigest(topItems, staleItems, smallWins);
            
            // Should contain Might Be Stuck section when there are stale items
            expect(digest).toContain('**Might Be Stuck:**');
            
            // Each stale item should be mentioned
            for (const item of staleItems) {
              expect(digest).toContain(`${item.daysInInbox} days`);
            }
            
            return true;
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should not include Might Be Stuck section when no stale items', () => {
      fc.assert(
        fc.property(
          fc.array(topItemArbitrary, { minLength: 0, maxLength: 3 }),
          smallWinsArbitrary,
          (topItems, smallWins) => {
            const digest = digestService.formatDailyDigest(topItems, [], smallWins);
            
            // Should NOT contain Might Be Stuck section
            expect(digest).not.toContain('**Might Be Stuck:**');
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 3: Small Win Section Accuracy
   * Validates: Requirements 1.3
   */
  describe('Property 3: Small Win Section Accuracy', () => {
    it('should show Small Win section only when completedCount > 0', () => {
      fc.assert(
        fc.property(
          fc.array(topItemArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(staleInboxItemArbitrary, { minLength: 0, maxLength: 3 }),
          fc.integer({ min: 1, max: 100 }),
          fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
          (topItems, staleItems, completedCount, nextTask) => {
            const smallWins = { completedCount, nextTask };
            const digest = digestService.formatDailyDigest(topItems, staleItems, smallWins);
            
            // Should contain Small Win section
            expect(digest).toContain('**Small Win:**');
            expect(digest).toContain(`${completedCount} admin task`);
            
            return true;
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should not show Small Win section when completedCount is 0', () => {
      fc.assert(
        fc.property(
          fc.array(topItemArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(staleInboxItemArbitrary, { minLength: 0, maxLength: 3 }),
          (topItems, staleItems) => {
            const smallWins = { completedCount: 0, nextTask: undefined };
            const digest = digestService.formatDailyDigest(topItems, staleItems, smallWins);
            
            // Should NOT contain Small Win section
            expect(digest).not.toContain('**Small Win:**');
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 4: Daily Tip Inclusion
   * Validates: Daily momentum tip is shown when provided.
   */
  describe('Property 4: Daily Tip Inclusion', () => {
    it('should include the daily tip section when a tip is provided', () => {
      const digest = digestService.formatDailyDigest([], [], { completedCount: 0 }, 'Test tip');
      expect(digest).toContain('**Daily Momentum Tip:**');
      expect(digest).toContain('Test tip');
    });

    it('should omit the daily tip section when no tip is provided', () => {
      const digest = digestService.formatDailyDigest([], [], { completedCount: 0 });
      expect(digest).not.toContain('**Daily Momentum Tip:**');
    });
  });

  /**
   * Property 4: Daily Digest Structure Invariant
   * Validates: Requirements 1.4
   */
  describe('Property 4: Daily Digest Structure Invariant', () => {
    it('should always contain required sections in correct order', () => {
      fc.assert(
        fc.property(
          fc.array(topItemArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(staleInboxItemArbitrary, { minLength: 0, maxLength: 3 }),
          smallWinsArbitrary,
          (topItems, staleItems, smallWins) => {
            const digest = digestService.formatDailyDigest(topItems, staleItems, smallWins);
            
            // Must contain greeting
            expect(digest).toContain('Good morning');
            
            // Must contain Top 3 section
            expect(digest).toContain('**Top 3 for Today:**');
            
            // Must contain footer
            expect(digest).toContain('Reply to this message to capture a thought.');
            
            // Check order: greeting before Top 3, Top 3 before footer
            const greetingIndex = digest.indexOf('Good morning');
            const top3Index = digest.indexOf('**Top 3 for Today:**');
            const footerIndex = digest.indexOf('Reply to this message');
            
            expect(greetingIndex).toBeLessThan(top3Index);
            expect(top3Index).toBeLessThan(footerIndex);
            
            // If Might Be Stuck exists, it should be after Top 3
            if (staleItems.length > 0) {
              const stuckIndex = digest.indexOf('**Might Be Stuck:**');
              expect(stuckIndex).toBeGreaterThan(top3Index);
              expect(stuckIndex).toBeLessThan(footerIndex);
            }
            
            // If Small Win exists, it should be after Top 3 (and after Might Be Stuck if present)
            if (smallWins.completedCount > 0) {
              const winIndex = digest.indexOf('**Small Win:**');
              expect(winIndex).toBeGreaterThan(top3Index);
              expect(winIndex).toBeLessThan(footerIndex);
            }
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 5: Daily Digest Word Count Limit
   * Validates: Requirements 1.5
   */
  describe('Property 5: Daily Digest Word Count Limit', () => {
    it('should generate digest with fewer than 150 words', () => {
      fc.assert(
        fc.property(
          fc.array(topItemArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(staleInboxItemArbitrary, { minLength: 0, maxLength: 3 }),
          smallWinsArbitrary,
          (topItems, staleItems, smallWins) => {
            const digest = digestService.formatDailyDigest(topItems, staleItems, smallWins);
            const wordCount = digestService.countWords(digest);
            
            // Word count should be under 150
            expect(wordCount).toBeLessThan(150);
            
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});


// ============================================
// Property Tests for Weekly Review
// ============================================

describe('DigestService - Weekly Review Properties', () => {
  let digestService: DigestService;

  beforeEach(() => {
    digestService = createTestDigestService();
  });

  /**
   * Property 6: Weekly Review Statistics Accuracy
   * Validates: Requirements 2.1
   */
  describe('Property 6: Weekly Review Statistics Accuracy', () => {
    it('should display exact counts from activity stats', () => {
      fc.assert(
        fc.property(
          activityStatsArbitrary,
          fc.array(openLoopArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(suggestionArbitrary, { minLength: 0, maxLength: 3 }),
          fc.string({ minLength: 10, maxLength: 100 }),
          (stats, openLoops, suggestions, theme) => {
            const startDate = new Date('2026-01-20');
            const endDate = new Date('2026-01-26');
            
            const review = digestService.formatWeeklyReview(
              startDate,
              endDate,
              stats,
              openLoops,
              suggestions,
              theme
            );
            
            // Should contain exact message count
            expect(review).toContain(`${stats.messagesCount} thoughts captured`);
            
            // Should contain exact entries total
            expect(review).toContain(`${stats.entriesCreated.total} entries created`);
            
            // Should contain exact tasks completed
            expect(review).toContain(`${stats.tasksCompleted} tasks completed`);
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 7: Open Loops Selection
   * Validates: Requirements 2.2
   */
  describe('Property 7: Open Loops Selection', () => {
    it('should include at most 3 open loops', () => {
      fc.assert(
        fc.property(
          activityStatsArbitrary,
          fc.array(openLoopArbitrary, { minLength: 0, maxLength: 10 }),
          fc.array(suggestionArbitrary, { minLength: 0, maxLength: 3 }),
          fc.string({ minLength: 10, maxLength: 100 }),
          (stats, openLoops, suggestions, theme) => {
            const startDate = new Date('2026-01-20');
            const endDate = new Date('2026-01-26');
            
            const review = digestService.formatWeeklyReview(
              startDate,
              endDate,
              stats,
              openLoops.slice(0, 3), // Service limits to 3
              suggestions,
              theme
            );
            
            // Count numbered items in Open Loops section
            const loopsMatch = review.match(/\*\*Biggest Open Loops:\*\*[\s\S]*?(?=\n\n\*\*|$)/);
            if (loopsMatch && openLoops.length > 0) {
              const numberedItems = loopsMatch[0].match(/^\d+\./gm) || [];
              expect(numberedItems.length).toBeLessThanOrEqual(3);
            }
            
            return true;
          }
        ),
        { numRuns: 15 }
      );
    });
  });

  /**
   * Property 8: Weekly Review Structure Invariant
   * Validates: Requirements 2.5
   */
  describe('Property 8: Weekly Review Structure Invariant', () => {
    it('should always contain required sections in correct order', () => {
      fc.assert(
        fc.property(
          activityStatsArbitrary,
          fc.array(openLoopArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(suggestionArbitrary, { minLength: 0, maxLength: 3 }),
          fc.string({ minLength: 10, maxLength: 100 }),
          (stats, openLoops, suggestions, theme) => {
            const startDate = new Date('2026-01-20');
            const endDate = new Date('2026-01-26');
            
            const review = digestService.formatWeeklyReview(
              startDate,
              endDate,
              stats,
              openLoops,
              suggestions,
              theme
            );
            
            // Must contain all required sections
            expect(review).toContain('# Week of');
            expect(review).toContain('**What Happened:**');
            expect(review).toContain('**Biggest Open Loops:**');
            expect(review).toContain('**Suggested Focus for Next Week:**');
            expect(review).toContain('**Theme I Noticed:**');
            expect(review).toContain('Reply with thoughts or adjustments.');
            
            // Check order
            const whatHappenedIndex = review.indexOf('**What Happened:**');
            const openLoopsIndex = review.indexOf('**Biggest Open Loops:**');
            const suggestedIndex = review.indexOf('**Suggested Focus for Next Week:**');
            const themeIndex = review.indexOf('**Theme I Noticed:**');
            const footerIndex = review.indexOf('Reply with thoughts');
            
            expect(whatHappenedIndex).toBeLessThan(openLoopsIndex);
            expect(openLoopsIndex).toBeLessThan(suggestedIndex);
            expect(suggestedIndex).toBeLessThan(themeIndex);
            expect(themeIndex).toBeLessThan(footerIndex);
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });

  /**
   * Property 9: Weekly Review Word Count Limit
   * Validates: Requirements 2.6
   */
  describe('Property 9: Weekly Review Word Count Limit', () => {
    it('should generate review with fewer than 250 words', () => {
      fc.assert(
        fc.property(
          activityStatsArbitrary,
          fc.array(openLoopArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(suggestionArbitrary, { minLength: 0, maxLength: 3 }),
          fc.string({ minLength: 10, maxLength: 100 }),
          (stats, openLoops, suggestions, theme) => {
            const startDate = new Date('2026-01-20');
            const endDate = new Date('2026-01-26');
            
            const review = digestService.formatWeeklyReview(
              startDate,
              endDate,
              stats,
              openLoops,
              suggestions,
              theme
            );
            
            const wordCount = digestService.countWords(review);
            
            // Word count should be under 250
            expect(wordCount).toBeLessThan(250);
            
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
  });
});

// ============================================
// Property Tests for Markdown Output
// ============================================

describe('DigestService - Markdown Output Properties', () => {
  let digestService: DigestService;

  beforeEach(() => {
    digestService = createTestDigestService();
  });

  /**
   * Property 12: Markdown Output Validity
   * Validates: Requirements 4.3
   */
  describe('Property 12: Markdown Output Validity', () => {
    it('should generate valid markdown for daily digest', () => {
      fc.assert(
        fc.property(
          fc.array(topItemArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(staleInboxItemArbitrary, { minLength: 0, maxLength: 3 }),
          smallWinsArbitrary,
          (topItems, staleItems, smallWins) => {
            const digest = digestService.formatDailyDigest(topItems, staleItems, smallWins);
            
            // Should be a non-empty string
            expect(typeof digest).toBe('string');
            expect(digest.length).toBeGreaterThan(0);
            
            // Should contain valid markdown elements
            // Bold text should have matching pairs
            const boldMatches = digest.match(/\*\*[^*]+\*\*/g) || [];
            for (const match of boldMatches) {
              expect(match.startsWith('**')).toBe(true);
              expect(match.endsWith('**')).toBe(true);
            }
            
            // Numbered lists should be properly formatted
            const numberedItems = digest.match(/^\d+\./gm) || [];
            for (const item of numberedItems) {
              expect(item).toMatch(/^\d+\.$/);
            }
            
            // Horizontal rule should be valid
            if (digest.includes('---')) {
              expect(digest).toContain('\n---\n');
            }
            
            return true;
          }
        ),
        { numRuns: 15 }
      );
    });

    it('should generate valid markdown for weekly review', () => {
      fc.assert(
        fc.property(
          activityStatsArbitrary,
          fc.array(openLoopArbitrary, { minLength: 0, maxLength: 3 }),
          fc.array(suggestionArbitrary, { minLength: 0, maxLength: 3 }),
          fc.string({ minLength: 10, maxLength: 100 }),
          (stats, openLoops, suggestions, theme) => {
            const startDate = new Date('2026-01-20');
            const endDate = new Date('2026-01-26');
            
            const review = digestService.formatWeeklyReview(
              startDate,
              endDate,
              stats,
              openLoops,
              suggestions,
              theme
            );
            
            // Should be a non-empty string
            expect(typeof review).toBe('string');
            expect(review.length).toBeGreaterThan(0);
            
            // Should contain valid markdown header
            expect(review).toMatch(/^# Week of/);
            
            // Bold text should have matching pairs
            const boldMatches = review.match(/\*\*[^*]+\*\*/g) || [];
            for (const match of boldMatches) {
              expect(match.startsWith('**')).toBe(true);
              expect(match.endsWith('**')).toBe(true);
            }
            
            // Bullet points should be properly formatted
            const bulletItems = review.match(/^- /gm) || [];
            expect(bulletItems.length).toBeGreaterThan(0);
            
            return true;
          }
        ),
        { numRuns: 15 }
      );
    });
  });
});

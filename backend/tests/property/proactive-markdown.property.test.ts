/**
 * Property Tests: Proactive Message Markdown Validity
 * 
 * Feature: proactive-crons, Property 6: Proactive Message Markdown Validity
 * 
 * These tests validate that all generated proactive messages (stale check,
 * follow-up reminder, and inactivity nudge) produce valid markdown output.
 * 
 * **Validates: Requirements 5.2**
 */

import * as fc from 'fast-check';
import { ProactiveService, StaleProject, FollowUpPerson } from '../../src/services/proactive.service';

// ============================================
// Markdown Validation Helpers
// ============================================

/**
 * Validates that markdown has balanced bold markers (**)
 * @param markdown - The markdown string to validate
 * @returns true if bold markers are balanced
 */
function hasBalancedBoldMarkers(markdown: string): boolean {
  // Count occurrences of ** (bold markers)
  const matches = markdown.match(/\*\*/g);
  if (!matches) return true; // No bold markers is valid
  // Bold markers should come in pairs
  return matches.length % 2 === 0;
}

/**
 * Validates that markdown list items are properly formatted
 * @param markdown - The markdown string to validate
 * @returns true if list items are properly formatted
 */
function hasValidListItems(markdown: string): boolean {
  const lines = markdown.split('\n');
  for (const line of lines) {
    // Check lines that start with list markers
    if (line.match(/^\s*-\s/)) {
      // List item should have content after the marker
      const content = line.replace(/^\s*-\s*/, '').trim();
      if (content.length === 0) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Validates that markdown has proper structure (headers, content, etc.)
 * @param markdown - The markdown string to validate
 * @returns true if markdown has valid structure
 */
function hasValidStructure(markdown: string): boolean {
  // Should not be empty
  if (!markdown || markdown.trim().length === 0) {
    return false;
  }
  
  // Should have at least one line of content
  const lines = markdown.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) {
    return false;
  }
  
  return true;
}

/**
 * Validates that markdown doesn't have unclosed formatting
 * @param markdown - The markdown string to validate
 * @returns true if all formatting is properly closed
 */
function hasNoUnclosedFormatting(markdown: string): boolean {
  // Check for balanced ** (bold)
  if (!hasBalancedBoldMarkers(markdown)) {
    return false;
  }
  
  // Check for balanced * (italic) - count single asterisks not part of **
  const withoutBold = markdown.replace(/\*\*/g, '');
  const singleAsterisks = (withoutBold.match(/\*/g) || []).length;
  if (singleAsterisks % 2 !== 0) {
    return false;
  }
  
  return true;
}

/**
 * Comprehensive markdown validation
 * @param markdown - The markdown string to validate
 * @returns object with validation result and any error message
 */
function validateMarkdown(markdown: string): { valid: boolean; error?: string } {
  if (!hasValidStructure(markdown)) {
    return { valid: false, error: 'Invalid structure: empty or no content' };
  }
  
  if (!hasBalancedBoldMarkers(markdown)) {
    return { valid: false, error: 'Unbalanced bold markers (**)' };
  }
  
  if (!hasNoUnclosedFormatting(markdown)) {
    return { valid: false, error: 'Unclosed formatting detected' };
  }
  
  if (!hasValidListItems(markdown)) {
    return { valid: false, error: 'Invalid list items (empty content after marker)' };
  }
  
  return { valid: true };
}

// ============================================
// Test Arbitraries
// ============================================

/**
 * Stale project generator for markdown testing
 */
const staleProjectArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0)
    .map(s => s.replace(/\*/g, '')), // Remove asterisks to avoid breaking markdown
  status: fc.constantFrom('active', 'waiting', 'blocked') as fc.Arbitrary<'active' | 'waiting' | 'blocked'>,
  daysSinceUpdate: fc.integer({ min: 15, max: 365 }),
  path: fc.constant('projects/test.md')
});

/**
 * Follow-up person generator for markdown testing
 */
const followUpPersonArbitrary = fc.record({
  name: fc.string({ minLength: 1, maxLength: 50 })
    .filter(s => s.trim().length > 0)
    .map(s => s.replace(/\*/g, '')), // Remove asterisks to avoid breaking markdown
  followUps: fc.array(
    fc.string({ minLength: 1, maxLength: 100 })
      .filter(s => s.trim().length > 0)
      .map(s => s.replace(/\*/g, '')), // Remove asterisks
    { minLength: 1, maxLength: 2 }
  ),
  lastTouched: fc.option(
    fc.date({ min: new Date('2020-01-01'), max: new Date() })
      .map(d => d.toISOString().split('T')[0])
  ),
  daysSinceContact: fc.integer({ min: 0, max: 365 })
});

/**
 * Days configuration generator for nudge messages
 */
const daysArbitrary = fc.integer({ min: 1, max: 30 });

// ============================================
// Property Tests
// ============================================

describe('Property Tests: Proactive Message Markdown Validity', () => {
  /**
   * Property 6: Proactive Message Markdown Validity
   * 
   * Feature: proactive-crons, Property 6: Proactive Message Markdown Validity
   * 
   * *For any* generated proactive message (stale check, follow-up reminder, 
   * or inactivity nudge), the output SHALL be valid markdown that can be 
   * parsed without errors.
   * 
   * **Validates: Requirements 5.2**
   */
  describe('Property 6: Proactive Message Markdown Validity', () => {
    
    it('formatStaleCheck SHALL produce valid markdown for any stale projects', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(staleProjectArbitrary, { minLength: 1, maxLength: 5 }),
          async (staleProjects) => {
            // Create ProactiveService (no mocks needed for formatting)
            const proactiveService = new ProactiveService(null, null);
            
            // Format the stale check message
            const message = proactiveService.formatStaleCheck(staleProjects as StaleProject[]);
            
            // Property: Output should be valid markdown
            const validation = validateMarkdown(message);
            expect(validation.valid).toBe(true);
            
            // Additional structural checks for stale check format
            expect(message).toContain('**🔍 Stale Project Check**');
            expect(message).toContain("These projects haven't been updated in a while:");
            expect(message).toContain('Consider reviewing these to keep things moving.');
            
            // Each project should be in a list item with bold name
            for (const project of staleProjects) {
              expect(message).toContain(`- **${project.name}**`);
              expect(message).toContain(`(${project.status})`);
              expect(message).toContain(`${project.daysSinceUpdate} days`);
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('formatFollowUpReminder SHALL produce valid markdown for any people with follow-ups', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(followUpPersonArbitrary, { minLength: 1, maxLength: 5 }),
          async (people) => {
            // Create ProactiveService (no mocks needed for formatting)
            const proactiveService = new ProactiveService(null, null);
            
            // Format the follow-up reminder message
            const message = proactiveService.formatFollowUpReminder(people as FollowUpPerson[]);
            
            // Property: Output should be valid markdown
            const validation = validateMarkdown(message);
            expect(validation.valid).toBe(true);
            
            // Additional structural checks for follow-up format
            expect(message).toContain('**👋 Follow-up Reminder**');
            expect(message).toContain('You have pending follow-ups with:');
            expect(message).toContain('Reply to mark any as done or add notes.');
            
            // Each person should have bold name
            for (const person of people) {
              expect(message).toContain(`**${person.name}**`);
            }
            
            // Each follow-up should be in a list item
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

    it('getNudgeMessage SHALL produce valid markdown for any days value', async () => {
      await fc.assert(
        fc.asyncProperty(
          daysArbitrary,
          async (days) => {
            // Create ProactiveService (no mocks needed for getNudgeMessage)
            const proactiveService = new ProactiveService(null, null);
            
            // Get nudge message
            const message = proactiveService.getNudgeMessage(days);
            
            // Property: Output should be valid markdown
            const validation = validateMarkdown(message);
            expect(validation.valid).toBe(true);
            
            // Property: Message should be one of the 3 variations with valid headers
            const variation1Header = '**💭 Quick thought?**';
            const variation2Header = '**🌱 Time to capture?**';
            const variation3Header = '**📝 Gentle nudge**';
            
            const hasValidHeader = 
              message.includes(variation1Header) ||
              message.includes(variation2Header) ||
              message.includes(variation3Header);
            
            expect(hasValidHeader).toBe(true);
            
            // Property: Message should contain the days count
            expect(message).toContain(`${days} days`);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('all three message types SHALL have balanced bold markers', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(staleProjectArbitrary, { minLength: 1, maxLength: 3 }),
          fc.array(followUpPersonArbitrary, { minLength: 1, maxLength: 3 }),
          daysArbitrary,
          async (staleProjects, people, days) => {
            const proactiveService = new ProactiveService(null, null);
            
            // Generate all three message types
            const staleMessage = proactiveService.formatStaleCheck(staleProjects as StaleProject[]);
            const followUpMessage = proactiveService.formatFollowUpReminder(people as FollowUpPerson[]);
            const nudgeMessage = proactiveService.getNudgeMessage(days);
            
            // Property: All messages should have balanced bold markers
            expect(hasBalancedBoldMarkers(staleMessage)).toBe(true);
            expect(hasBalancedBoldMarkers(followUpMessage)).toBe(true);
            expect(hasBalancedBoldMarkers(nudgeMessage)).toBe(true);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('all three message types SHALL have valid list items', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(staleProjectArbitrary, { minLength: 1, maxLength: 3 }),
          fc.array(followUpPersonArbitrary, { minLength: 1, maxLength: 3 }),
          async (staleProjects, people) => {
            const proactiveService = new ProactiveService(null, null);
            
            // Generate messages with list items
            const staleMessage = proactiveService.formatStaleCheck(staleProjects as StaleProject[]);
            const followUpMessage = proactiveService.formatFollowUpReminder(people as FollowUpPerson[]);
            
            // Property: All messages should have valid list items
            expect(hasValidListItems(staleMessage)).toBe(true);
            expect(hasValidListItems(followUpMessage)).toBe(true);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('all three message types SHALL have proper structure', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(staleProjectArbitrary, { minLength: 1, maxLength: 3 }),
          fc.array(followUpPersonArbitrary, { minLength: 1, maxLength: 3 }),
          daysArbitrary,
          async (staleProjects, people, days) => {
            const proactiveService = new ProactiveService(null, null);
            
            // Generate all three message types
            const staleMessage = proactiveService.formatStaleCheck(staleProjects as StaleProject[]);
            const followUpMessage = proactiveService.formatFollowUpReminder(people as FollowUpPerson[]);
            const nudgeMessage = proactiveService.getNudgeMessage(days);
            
            // Property: All messages should have valid structure
            expect(hasValidStructure(staleMessage)).toBe(true);
            expect(hasValidStructure(followUpMessage)).toBe(true);
            expect(hasValidStructure(nudgeMessage)).toBe(true);
            
            // Property: All messages should be non-empty strings
            expect(typeof staleMessage).toBe('string');
            expect(typeof followUpMessage).toBe('string');
            expect(typeof nudgeMessage).toBe('string');
            expect(staleMessage.length).toBeGreaterThan(0);
            expect(followUpMessage.length).toBeGreaterThan(0);
            expect(nudgeMessage.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('stale check message SHALL include expected markdown elements', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(staleProjectArbitrary, { minLength: 1, maxLength: 5 }),
          async (staleProjects) => {
            const proactiveService = new ProactiveService(null, null);
            const message = proactiveService.formatStaleCheck(staleProjects as StaleProject[]);
            
            // Property: Should have header with emoji and bold
            expect(message).toMatch(/\*\*🔍.*\*\*/);
            
            // Property: Should have list items for each project
            const listItemCount = (message.match(/^- \*\*/gm) || []).length;
            expect(listItemCount).toBe(staleProjects.length);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('follow-up message SHALL include expected markdown elements', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(followUpPersonArbitrary, { minLength: 1, maxLength: 5 }),
          async (people) => {
            const proactiveService = new ProactiveService(null, null);
            const message = proactiveService.formatFollowUpReminder(people as FollowUpPerson[]);
            
            // Property: Should have header with emoji and bold
            expect(message).toMatch(/\*\*👋.*\*\*/);
            
            // Property: Should have bold names for each person
            for (const person of people) {
              expect(message).toContain(`**${person.name}**`);
            }
            
            // Property: Should have indented list items for follow-ups
            for (const person of people) {
              for (const followUp of person.followUps) {
                expect(message).toContain(`  - ${followUp}`);
              }
            }
          }
        ),
        { numRuns: 3 }
      );
    });

    it('nudge message SHALL include expected markdown elements', async () => {
      await fc.assert(
        fc.asyncProperty(
          daysArbitrary,
          async (days) => {
            const proactiveService = new ProactiveService(null, null);
            const message = proactiveService.getNudgeMessage(days);
            
            // Property: Should have header with emoji and bold
            expect(message).toMatch(/\*\*[💭🌱📝].*\*\*/);
            
            // Property: Should include days count in message body
            expect(message).toContain(`${days} days`);
            
            // Property: Should have a call to action
            const hasCallToAction = 
              message.includes('Reply with') ||
              message.includes("What's one thing") ||
              message.includes("What's on your mind");
            expect(hasCallToAction).toBe(true);
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

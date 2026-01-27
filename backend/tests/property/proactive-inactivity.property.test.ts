/**
 * Property Tests: Inactivity Nudge
 * 
 * Feature: proactive-crons, Property 5: Inactivity Detection Correctness
 * 
 * These tests validate the inactivity detection and nudge generation
 * for the proactive crons feature.
 * 
 * **Validates: Requirements 3.2, 3.3, 3.4**
 */

import * as fc from 'fast-check';
import { ProactiveService } from '../../src/services/proactive.service';

// ============================================
// Test Arbitraries (from design.md)
// ============================================

/**
 * Message generator for inactivity testing
 * Based on design.md specification
 */
const messageArbitrary = fc.record({
  role: fc.constantFrom('user', 'assistant'),
  createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date() })
});

/**
 * Days configuration generator
 */
const daysConfigArbitrary = fc.integer({ min: 1, max: 30 });

// ============================================
// Mock Factories
// ============================================

/**
 * Create a mock Prisma client that returns message counts based on generated data
 * @param messages - Array of messages with role and createdAt
 * @param thresholdDate - The date threshold for counting recent messages
 */
const createMockPrismaClient = (
  messages: Array<{ role: string; createdAt: Date }>,
  thresholdDate: Date
) => {
  return {
    message: {
      count: jest.fn().mockImplementation(async (args: {
        where: {
          createdAt: { gte: Date };
          role: string;
        };
      }) => {
        // Count user messages that are >= threshold date
        const count = messages.filter(m => 
          m.role === args.where.role && 
          m.createdAt >= args.where.createdAt.gte
        ).length;
        return count;
      })
    }
  };
};

// ============================================
// Helper Functions
// ============================================

/**
 * Calculate threshold date based on inactivity days
 */
const getThresholdDate = (inactivityDays: number): Date => {
  const threshold = new Date();
  threshold.setDate(threshold.getDate() - inactivityDays);
  return threshold;
};

/**
 * Check if any user messages exist within the threshold
 */
const hasRecentUserMessages = (
  messages: Array<{ role: string; createdAt: Date }>,
  inactivityDays: number
): boolean => {
  const threshold = getThresholdDate(inactivityDays);
  return messages.some(m => m.role === 'user' && m.createdAt >= threshold);
};

// ============================================
// Property Tests
// ============================================

describe('Property Tests: Inactivity Nudge', () => {
  /**
   * Property 5: Inactivity Detection Correctness
   * 
   * Feature: proactive-crons, Property 5: Inactivity Detection Correctness
   * 
   * *For any* set of messages with various creation dates and roles, 
   * the inactivity detection function SHALL:
   * - Return a nudge message if no user messages exist within INACTIVITY_DAYS
   * - Return null if at least one user message exists within INACTIVITY_DAYS
   * 
   * **Validates: Requirements 3.2, 3.3, 3.4**
   */
  describe('Property 5: Inactivity Detection Correctness', () => {
    it('checkUserActivity SHALL return true when user messages exist within threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate messages with at least one recent user message
          fc.array(messageArbitrary, { minLength: 1, maxLength: 20 }),
          daysConfigArbitrary,
          async (messages, inactivityDays) => {
            const threshold = getThresholdDate(inactivityDays);
            
            // Ensure at least one user message is within threshold
            const recentUserMessage = {
              role: 'user' as const,
              createdAt: new Date() // Now is always within threshold
            };
            const messagesWithRecent = [...messages, recentUserMessage];
            
            // Create mock Prisma client
            const mockPrisma = createMockPrismaClient(messagesWithRecent, threshold);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              null, // No EntryService needed
              null, // No ConversationService needed
              mockPrisma as any
            );
            
            // Check user activity
            const isActive = await proactiveService.checkUserActivity(inactivityDays);
            
            // Property: Should return true when user messages exist within threshold
            expect(isActive).toBe(true);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('checkUserActivity SHALL return false when no user messages exist within threshold', async () => {
      await fc.assert(
        fc.asyncProperty(
          daysConfigArbitrary,
          async (inactivityDays) => {
            // Create messages that are all older than threshold or are assistant messages
            const oldDate = new Date('2020-01-01');
            const messages = [
              { role: 'assistant', createdAt: new Date() }, // Recent but assistant
              { role: 'user', createdAt: oldDate }, // User but old
              { role: 'assistant', createdAt: oldDate } // Old assistant
            ];
            
            const threshold = getThresholdDate(inactivityDays);
            
            // Create mock Prisma client
            const mockPrisma = createMockPrismaClient(messages, threshold);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              null,
              null,
              mockPrisma as any
            );
            
            // Check user activity
            const isActive = await proactiveService.checkUserActivity(inactivityDays);
            
            // Property: Should return false when no user messages exist within threshold
            expect(isActive).toBe(false);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('generateInactivityNudge SHALL return null when user is active', async () => {
      await fc.assert(
        fc.asyncProperty(
          daysConfigArbitrary,
          async (inactivityDays) => {
            // Create a recent user message
            const messages = [
              { role: 'user', createdAt: new Date() } // Recent user message
            ];
            
            const threshold = getThresholdDate(inactivityDays);
            
            // Create mock Prisma client
            const mockPrisma = createMockPrismaClient(messages, threshold);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              null,
              null,
              mockPrisma as any
            );
            
            // Generate inactivity nudge
            const result = await proactiveService.generateInactivityNudge();
            
            // Property: Should return null when user is active
            expect(result).toBeNull();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('generateInactivityNudge SHALL return a nudge message when user is inactive', async () => {
      await fc.assert(
        fc.asyncProperty(
          daysConfigArbitrary,
          async (inactivityDays) => {
            // Create only old messages or assistant messages
            const oldDate = new Date('2020-01-01');
            const messages = [
              { role: 'assistant', createdAt: new Date() },
              { role: 'user', createdAt: oldDate }
            ];
            
            const threshold = getThresholdDate(inactivityDays);
            
            // Create mock Prisma client
            const mockPrisma = createMockPrismaClient(messages, threshold);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              null,
              null,
              mockPrisma as any
            );
            
            // Generate inactivity nudge
            const result = await proactiveService.generateInactivityNudge();
            
            // Property: Should return a nudge message when user is inactive
            expect(result).not.toBeNull();
            expect(typeof result).toBe('string');
            expect(result!.length).toBeGreaterThan(0);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('getNudgeMessage SHALL return one of the 3 variations', async () => {
      await fc.assert(
        fc.asyncProperty(
          daysConfigArbitrary,
          async (days) => {
            // Create ProactiveService (no mocks needed for getNudgeMessage)
            const proactiveService = new ProactiveService(null, null);
            
            // Get nudge message
            const message = proactiveService.getNudgeMessage(days);
            
            // Property: Message should be one of the 3 variations
            const variation1Start = '**💭 Quick thought?**';
            const variation2Start = '**🌱 Time to capture?**';
            const variation3Start = '**📝 Gentle nudge**';
            
            const isValidVariation = 
              message.includes(variation1Start) ||
              message.includes(variation2Start) ||
              message.includes(variation3Start);
            
            expect(isValidVariation).toBe(true);
            
            // Property: Message should contain the days count
            expect(message).toContain(`${days} days`);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL correctly distinguish between user and assistant messages', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(messageArbitrary, { minLength: 1, maxLength: 20 }),
          daysConfigArbitrary,
          async (messages, inactivityDays) => {
            const threshold = getThresholdDate(inactivityDays);
            
            // Create mock Prisma client
            const mockPrisma = createMockPrismaClient(messages, threshold);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              null,
              null,
              mockPrisma as any
            );
            
            // Check user activity
            const isActive = await proactiveService.checkUserActivity(inactivityDays);
            
            // Calculate expected result
            const expectedActive = hasRecentUserMessages(messages, inactivityDays);
            
            // Property: Result should match expected based on user messages only
            expect(isActive).toBe(expectedActive);
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL handle empty message list correctly', async () => {
      await fc.assert(
        fc.asyncProperty(
          daysConfigArbitrary,
          async (inactivityDays) => {
            // Empty messages array
            const messages: Array<{ role: string; createdAt: Date }> = [];
            
            const threshold = getThresholdDate(inactivityDays);
            
            // Create mock Prisma client
            const mockPrisma = createMockPrismaClient(messages, threshold);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              null,
              null,
              mockPrisma as any
            );
            
            // Check user activity
            const isActive = await proactiveService.checkUserActivity(inactivityDays);
            
            // Property: Should return false when no messages exist
            expect(isActive).toBe(false);
            
            // Generate inactivity nudge
            const nudge = await proactiveService.generateInactivityNudge();
            
            // Property: Should return a nudge when no messages exist
            expect(nudge).not.toBeNull();
          }
        ),
        { numRuns: 3 }
      );
    });

    it('SHALL only count user messages, not assistant messages, for activity', async () => {
      await fc.assert(
        fc.asyncProperty(
          daysConfigArbitrary,
          async (inactivityDays) => {
            // Create only recent assistant messages (no user messages)
            const messages = [
              { role: 'assistant', createdAt: new Date() },
              { role: 'assistant', createdAt: new Date() },
              { role: 'assistant', createdAt: new Date() }
            ];
            
            const threshold = getThresholdDate(inactivityDays);
            
            // Create mock Prisma client
            const mockPrisma = createMockPrismaClient(messages, threshold);
            
            // Create ProactiveService with mock
            const proactiveService = new ProactiveService(
              null,
              null,
              mockPrisma as any
            );
            
            // Check user activity
            const isActive = await proactiveService.checkUserActivity(inactivityDays);
            
            // Property: Should return false even with recent assistant messages
            expect(isActive).toBe(false);
          }
        ),
        { numRuns: 3 }
      );
    });
  });
});

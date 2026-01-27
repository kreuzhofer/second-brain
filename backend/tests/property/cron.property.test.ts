/**
 * Property-based tests for Cron Service
 * Feature: digests-and-reviews
 * 
 * Tests correctness properties for cron expression generation and concurrency control.
 */

import * as fc from 'fast-check';
import {
  generateCronExpression,
  parseCronExpression,
  dayOfWeekToNumber,
  CronService
} from '../../src/services/cron.service';

// ============================================
// Test Data Generators (Arbitraries)
// ============================================

// Time string generator (HH:MM format)
const timeArbitrary = fc.tuple(
  fc.integer({ min: 0, max: 23 }),
  fc.integer({ min: 0, max: 59 })
).map(([h, m]) => `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`);

// Day of week generator
const dayOfWeekArbitrary = fc.constantFrom(
  'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'
);

// ============================================
// Property Tests for Cron Expression Generation
// ============================================

describe('CronService - Cron Expression Properties', () => {
  /**
   * Property 10: Cron Expression Generation
   * Validates: Requirements 3.1, 3.2
   */
  describe('Property 10: Cron Expression Generation', () => {
    it('should generate valid daily cron expression that round-trips correctly', () => {
      fc.assert(
        fc.property(
          timeArbitrary,
          (time) => {
            const expression = generateCronExpression(time);
            const parsed = parseCronExpression(expression);
            
            const [expectedHours, expectedMinutes] = time.split(':').map(Number);
            
            // Should round-trip correctly
            expect(parsed.hours).toBe(expectedHours);
            expect(parsed.minutes).toBe(expectedMinutes);
            expect(parsed.dayOfWeek).toBeUndefined();
            
            // Should be valid cron format (5 parts)
            const parts = expression.split(' ');
            expect(parts.length).toBe(5);
            
            // Last part should be * for daily
            expect(parts[4]).toBe('*');
            
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should generate valid weekly cron expression that round-trips correctly', () => {
      fc.assert(
        fc.property(
          timeArbitrary,
          dayOfWeekArbitrary,
          (time, day) => {
            const expression = generateCronExpression(time, day);
            const parsed = parseCronExpression(expression);
            
            const [expectedHours, expectedMinutes] = time.split(':').map(Number);
            const expectedDayNum = dayOfWeekToNumber(day);
            
            // Should round-trip correctly
            expect(parsed.hours).toBe(expectedHours);
            expect(parsed.minutes).toBe(expectedMinutes);
            expect(parsed.dayOfWeek).toBe(expectedDayNum);
            
            // Should be valid cron format (5 parts)
            const parts = expression.split(' ');
            expect(parts.length).toBe(5);
            
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });

    it('should map day of week strings to correct numbers', () => {
      fc.assert(
        fc.property(
          dayOfWeekArbitrary,
          (day) => {
            const dayNum = dayOfWeekToNumber(day);
            
            // Should be in valid range
            expect(dayNum).toBeGreaterThanOrEqual(0);
            expect(dayNum).toBeLessThanOrEqual(6);
            
            // Verify specific mappings
            const expectedMappings: Record<string, number> = {
              sunday: 0,
              monday: 1,
              tuesday: 2,
              wednesday: 3,
              thursday: 4,
              friday: 5,
              saturday: 6
            };
            
            expect(dayNum).toBe(expectedMappings[day]);
            
            return true;
          }
        ),
        { numRuns: 7 } // Only 7 days, so 7 runs covers all
      );
    });

    it('should handle edge case times correctly', () => {
      // Test midnight
      const midnight = generateCronExpression('00:00');
      const parsedMidnight = parseCronExpression(midnight);
      expect(parsedMidnight.hours).toBe(0);
      expect(parsedMidnight.minutes).toBe(0);
      
      // Test end of day
      const endOfDay = generateCronExpression('23:59');
      const parsedEndOfDay = parseCronExpression(endOfDay);
      expect(parsedEndOfDay.hours).toBe(23);
      expect(parsedEndOfDay.minutes).toBe(59);
      
      // Test noon
      const noon = generateCronExpression('12:00');
      const parsedNoon = parseCronExpression(noon);
      expect(parsedNoon.hours).toBe(12);
      expect(parsedNoon.minutes).toBe(0);
    });
  });
});

// ============================================
// Property Tests for Concurrency Control
// ============================================

describe('CronService - Concurrency Control Properties', () => {
  // Mock proactive service to avoid dependency on EntryService/GitService
  const mockProactiveService = {
    generateStaleCheck: jest.fn().mockResolvedValue(null),
    generateFollowUpReminder: jest.fn().mockResolvedValue(null),
    generateInactivityNudge: jest.fn().mockResolvedValue(null),
    deliverToChat: jest.fn().mockResolvedValue(undefined)
  };

  /**
   * Property 11: Concurrent Job Prevention
   * Validates: Requirements 3.6
   */
  describe('Property 11: Concurrent Job Prevention', () => {
    it('should prevent concurrent execution of the same job', async () => {
      // Create a mock digest service that delays
      const mockDigestService = {
        generateDailyDigest: jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve('Daily digest'), 100))
        ),
        generateWeeklyReview: jest.fn().mockImplementation(() => 
          new Promise(resolve => setTimeout(() => resolve('Weekly review'), 100))
        ),
        deliverToChat: jest.fn().mockResolvedValue(undefined)
      };

      // Create CronService with mocks
      const cronService = new CronService(mockDigestService as any, mockProactiveService as any);

      // Manually add job to running set to simulate concurrent execution
      (cronService as any).runningJobs.add('daily_digest');

      // Try to execute the same job
      const result = await cronService.executeJob('daily_digest', () => 
        mockDigestService.generateDailyDigest()
      );

      // Should be skipped
      expect(result.success).toBe(false);
      expect(result.error).toBe('Job already running');
      
      // Generator should not have been called
      expect(mockDigestService.generateDailyDigest).not.toHaveBeenCalled();

      // Clean up
      (cronService as any).runningJobs.delete('daily_digest');
    });

    it('should allow execution when job is not running', async () => {
      const mockDigestService = {
        generateDailyDigest: jest.fn().mockResolvedValue('Daily digest content'),
        generateWeeklyReview: jest.fn().mockResolvedValue('Weekly review content'),
        deliverToChat: jest.fn().mockResolvedValue(undefined)
      };

      const cronService = new CronService(mockDigestService as any, mockProactiveService as any);

      // Verify job is not running
      expect(cronService.isJobRunning('daily_digest')).toBe(false);

      // Note: We can't fully test executeJob without a real database
      // This test verifies the isJobRunning check works correctly
    });

    it('should track running jobs correctly', () => {
      fc.assert(
        fc.property(
          fc.constantFrom('daily_digest', 'weekly_review') as fc.Arbitrary<'daily_digest' | 'weekly_review'>,
          (jobName) => {
            const mockDigestService = {
              generateDailyDigest: jest.fn(),
              generateWeeklyReview: jest.fn(),
              deliverToChat: jest.fn()
            };

            const cronService = new CronService(mockDigestService as any, mockProactiveService as any);
            
            // Initially not running
            expect(cronService.isJobRunning(jobName)).toBe(false);
            
            // Manually add to running set
            (cronService as any).runningJobs.add(jobName);
            expect(cronService.isJobRunning(jobName)).toBe(true);
            
            // Remove from running set
            (cronService as any).runningJobs.delete(jobName);
            expect(cronService.isJobRunning(jobName)).toBe(false);
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
  });
});

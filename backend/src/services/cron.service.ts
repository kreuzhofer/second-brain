/**
 * Cron Service
 * Manages scheduled job execution for digests and reviews.
 * Uses node-cron for scheduling with timezone support.
 */

import * as cron from 'node-cron';
import { getConfig } from '../config/env';
import { getPrismaClient } from '../lib/prisma';
import { getCalendarService } from './calendar.service';
import { DigestService, getDigestService } from './digest.service';
import { ProactiveService, getProactiveService } from './proactive.service';

// ============================================
// Types
// ============================================

export type JobName =
  | 'daily_digest'
  | 'weekly_review'
  | 'stale_check'
  | 'followup_reminder'
  | 'inactivity_nudge'
  | 'calendar_sync';

export interface CronJobResult {
  jobName: JobName;
  success: boolean;
  content?: string;
  error?: string;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Convert day of week string to cron number (0-6, Sunday = 0)
 */
export function dayOfWeekToNumber(day: string): number {
  const days: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };
  return days[day.toLowerCase()] ?? 0;
}

/**
 * Generate a cron expression from time and optional day of week
 * @param time - Time in HH:MM format
 * @param dayOfWeek - Optional day of week (e.g., "sunday")
 * @returns Cron expression string
 */
export function generateCronExpression(time: string, dayOfWeek?: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  
  if (dayOfWeek) {
    // Weekly: "minutes hours * * dayOfWeek"
    const dayNum = dayOfWeekToNumber(dayOfWeek);
    return `${minutes} ${hours} * * ${dayNum}`;
  }
  
  // Daily: "minutes hours * * *"
  return `${minutes} ${hours} * * *`;
}

/**
 * Parse a cron expression back to time and day
 * @param expression - Cron expression
 * @returns Object with hours, minutes, and optional dayOfWeek
 */
export function parseCronExpression(expression: string): { hours: number; minutes: number; dayOfWeek?: number } {
  const parts = expression.split(' ');
  const minutes = parseInt(parts[0], 10);
  const hours = parseInt(parts[1], 10);
  const dayOfWeek = parts[4] !== '*' ? parseInt(parts[4], 10) : undefined;
  
  return { hours, minutes, dayOfWeek };
}

// ============================================
// Cron Service Class
// ============================================

export class CronService {
  private scheduledJobs: Map<string, cron.ScheduledTask> = new Map();
  private runningJobs: Set<string> = new Set();
  private digestService: DigestService;
  private proactiveService: ProactiveService;
  private prisma = getPrismaClient();
  private config = getConfig();

  constructor(digestService?: DigestService, proactiveService?: ProactiveService) {
    this.digestService = digestService || getDigestService();
    this.proactiveService = proactiveService || getProactiveService();
  }

  /**
   * Start all scheduled jobs
   */
  start(): void {
    console.log('Starting cron scheduler...');
    
    // Schedule daily digest
    const dailyExpression = generateCronExpression(this.config.DIGEST_TIME);
    console.log(`Scheduling daily digest at ${this.config.DIGEST_TIME} (${dailyExpression})`);
    
    const dailyJob = cron.schedule(dailyExpression, async () => {
      await this.executeJob('daily_digest', () => this.digestService.generateDailyDigest());
    }, {
      timezone: this.config.TIMEZONE
    });
    
    this.scheduledJobs.set('daily_digest', dailyJob);

    // Schedule weekly review
    const weeklyExpression = generateCronExpression(
      this.config.WEEKLY_REVIEW_TIME,
      this.config.WEEKLY_REVIEW_DAY
    );
    console.log(`Scheduling weekly review on ${this.config.WEEKLY_REVIEW_DAY} at ${this.config.WEEKLY_REVIEW_TIME} (${weeklyExpression})`);
    
    const weeklyJob = cron.schedule(weeklyExpression, async () => {
      await this.executeJob('weekly_review', () => this.digestService.generateWeeklyReview());
    }, {
      timezone: this.config.TIMEZONE
    });
    
    this.scheduledJobs.set('weekly_review', weeklyJob);
    
    // Schedule stale check job (Requirement 1.1)
    const staleCheckExpression = generateCronExpression(this.config.STALE_CHECK_TIME);
    console.log(`Scheduling stale check at ${this.config.STALE_CHECK_TIME} (${staleCheckExpression})`);
    
    const staleCheckJob = cron.schedule(staleCheckExpression, async () => {
      await this.executeProactiveJob('stale_check', () => this.proactiveService.generateStaleCheck());
    }, {
      timezone: this.config.TIMEZONE
    });
    
    this.scheduledJobs.set('stale_check', staleCheckJob);
    
    // Schedule follow-up reminder job (Requirement 2.1)
    const followupReminderExpression = generateCronExpression(this.config.FOLLOWUP_REMINDER_TIME);
    console.log(`Scheduling follow-up reminder at ${this.config.FOLLOWUP_REMINDER_TIME} (${followupReminderExpression})`);
    
    const followupReminderJob = cron.schedule(followupReminderExpression, async () => {
      await this.executeProactiveJob('followup_reminder', () => this.proactiveService.generateFollowUpReminder());
    }, {
      timezone: this.config.TIMEZONE
    });
    
    this.scheduledJobs.set('followup_reminder', followupReminderJob);
    
    // Schedule inactivity nudge job (Requirement 3.1)
    const inactivityNudgeExpression = generateCronExpression(this.config.INACTIVITY_NUDGE_TIME);
    console.log(`Scheduling inactivity nudge at ${this.config.INACTIVITY_NUDGE_TIME} (${inactivityNudgeExpression})`);
    
    const inactivityNudgeJob = cron.schedule(inactivityNudgeExpression, async () => {
      await this.executeProactiveJob('inactivity_nudge', () => this.proactiveService.generateInactivityNudge());
    }, {
      timezone: this.config.TIMEZONE
    });
    
    this.scheduledJobs.set('inactivity_nudge', inactivityNudgeJob);

    // Schedule hourly calendar source sync
    console.log('Scheduling hourly calendar source sync (0 * * * *)');
    const calendarSyncJob = cron.schedule('0 * * * *', async () => {
      const calendarService = getCalendarService();
      const sources = await calendarService.listAllEnabledSources();
      let synced = 0;
      let errors = 0;
      for (const source of sources) {
        try {
          await calendarService.syncSourceForUser(source.userId, source.id);
          synced++;
        } catch (err) {
          errors++;
          console.error(`Calendar sync failed for source ${source.id}:`, err instanceof Error ? err.message : err);
        }
      }
      console.log(`Calendar sync complete: ${synced} synced, ${errors} errors`);
    }, {
      timezone: this.config.TIMEZONE
    });
    this.scheduledJobs.set('calendar_sync', calendarSyncJob);

    console.log('Cron scheduler started successfully');
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    console.log('Stopping cron scheduler...');
    
    for (const [name, job] of this.scheduledJobs) {
      job.stop();
      console.log(`Stopped job: ${name}`);
    }
    
    this.scheduledJobs.clear();
    console.log('Cron scheduler stopped');
  }

  /**
   * Check if a job is currently running
   */
  isJobRunning(jobName: string): boolean {
    return this.runningJobs.has(jobName);
  }

  /**
   * Execute a job with CronJobRun tracking and concurrency control
   */
  async executeJob(
    jobName: JobName,
    generator: () => Promise<string>
  ): Promise<CronJobResult> {
    // Check for concurrent execution
    if (this.runningJobs.has(jobName)) {
      console.log(`Job ${jobName} already running, skipping`);
      return {
        jobName,
        success: false,
        error: 'Job already running'
      };
    }

    // Mark job as running
    this.runningJobs.add(jobName);
    
    // Create CronJobRun record
    const cronJobRun = await this.prisma.cronJobRun.create({
      data: {
        jobName,
        status: 'running'
      }
    });

    try {
      console.log(`Starting job: ${jobName}`);
      
      // Generate content
      const content = await generator();
      
      // Deliver via email if configured
      const recipientEmail = this.config.DIGEST_RECIPIENT_EMAIL;
      let emailSent = false;
      if (recipientEmail) {
        if (jobName === 'daily_digest') {
          emailSent = await this.digestService.deliverDailyDigestToEmail(recipientEmail, content);
        } else if (jobName === 'weekly_review') {
          emailSent = await this.digestService.deliverWeeklyReviewToEmail(recipientEmail, content);
        }
      }
      
      // Deliver to chat unless email was sent and skip is enabled
      const skipChat = emailSent && this.config.DIGEST_SKIP_CHAT_WHEN_EMAIL;
      if (!skipChat) {
        await this.digestService.deliverToChat(content);
      }
      
      // Update CronJobRun to success
      await this.prisma.cronJobRun.update({
        where: { id: cronJobRun.id },
        data: {
          status: 'success',
          result: content,
          completedAt: new Date()
        }
      });

      console.log(`Job ${jobName} completed successfully`);
      
      return {
        jobName,
        success: true,
        content
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Job ${jobName} failed:`, errorMessage);
      
      // Update CronJobRun to failed
      await this.prisma.cronJobRun.update({
        where: { id: cronJobRun.id },
        data: {
          status: 'failed',
          result: errorMessage,
          completedAt: new Date()
        }
      });

      return {
        jobName,
        success: false,
        error: errorMessage
      };
    } finally {
      // Always clean up running jobs set
      this.runningJobs.delete(jobName);
    }
  }

  /**
   * Execute a proactive job with conditional delivery
   * Only delivers to chat if generator returns content (not null)
   * 
   * Requirements: 1.6, 2.7, 3.6, 6.1, 6.2, 6.3, 6.4
   */
  async executeProactiveJob(
    jobName: JobName,
    generator: () => Promise<string | null>
  ): Promise<CronJobResult> {
    // Check for concurrent execution (Requirement 6.4)
    if (this.runningJobs.has(jobName)) {
      console.log(`Job ${jobName} already running, skipping`);
      return {
        jobName,
        success: false,
        error: 'Job already running'
      };
    }

    // Mark job as running
    this.runningJobs.add(jobName);
    
    // Create CronJobRun record with status "running" (Requirement 6.1)
    const cronJobRun = await this.prisma.cronJobRun.create({
      data: {
        jobName,
        status: 'running'
      }
    });

    try {
      console.log(`Starting proactive job: ${jobName}`);
      
      // Call generator function
      const content = await generator();
      
      if (content === null) {
        // No action needed - update CronJobRun but don't deliver (Requirement 6.2)
        await this.prisma.cronJobRun.update({
          where: { id: cronJobRun.id },
          data: {
            status: 'success',
            result: 'no action needed',
            completedAt: new Date()
          }
        });
        
        console.log(`Job ${jobName} completed - no action needed`);
        
        return {
          jobName,
          success: true
        };
      }
      
      // Deliver to chat and update CronJobRun with content (Requirement 6.2)
      await this.proactiveService.deliverToChat(content);
      
      await this.prisma.cronJobRun.update({
        where: { id: cronJobRun.id },
        data: {
          status: 'success',
          result: content,
          completedAt: new Date()
        }
      });

      console.log(`Job ${jobName} completed successfully`);
      
      return {
        jobName,
        success: true,
        content
      };
    } catch (error) {
      // Handle errors and update CronJobRun with "failed" status (Requirement 6.3)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Job ${jobName} failed:`, errorMessage);
      
      await this.prisma.cronJobRun.update({
        where: { id: cronJobRun.id },
        data: {
          status: 'failed',
          result: errorMessage,
          completedAt: new Date()
        }
      });

      return {
        jobName,
        success: false,
        error: errorMessage
      };
    } finally {
      // Always clean up running jobs set
      this.runningJobs.delete(jobName);
    }
  }

  /**
   * Manually trigger a job (for API endpoint)
   * Does not create CronJobRun record
   */
  async triggerManually(jobName: JobName): Promise<string> {
    if (jobName === 'daily_digest') {
      return this.digestService.generateDailyDigest();
    } else if (jobName === 'weekly_review') {
      return this.digestService.generateWeeklyReview();
    }
    throw new Error(`Unknown job: ${jobName}`);
  }
}

// ============================================
// Singleton Instance
// ============================================

let cronServiceInstance: CronService | null = null;

export function getCronService(): CronService {
  if (!cronServiceInstance) {
    cronServiceInstance = new CronService();
  }
  return cronServiceInstance;
}

export function resetCronService(): void {
  if (cronServiceInstance) {
    cronServiceInstance.stop();
  }
  cronServiceInstance = null;
}

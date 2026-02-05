/**
 * Proactive Service
 * Generates proactive notifications for the Second Brain application:
 * - Stale project checks
 * - Follow-up reminders
 * - Inactivity nudges
 * 
 * Implements proactive surfacing of relevant information via chat delivery.
 */

import { EntryService, getEntryService } from './entry.service';
import { ConversationService, getConversationService } from './conversation.service';
import { getConfig } from '../config/env';
import { ProjectStatus } from '../types/entry.types';
import { getPrismaClient } from '../lib/prisma';
import { PrismaClient } from '@prisma/client';
import { requireUserId } from '../context/user-context';

// ============================================
// Types
// ============================================

/**
 * Represents a project that hasn't been updated recently
 */
export interface StaleProject {
  name: string;
  status: 'active' | 'waiting' | 'blocked';
  daysSinceUpdate: number;
  path: string;
}

/**
 * Represents a person with pending follow-up items
 */
export interface FollowUpPerson {
  name: string;
  followUps: string[];
  lastTouched: string | null;
  daysSinceContact: number;
}

// ============================================
// Proactive Service Class
// ============================================

export class ProactiveService {
  private entryService: EntryService | null;
  private conversationService: ConversationService | null;
  private prisma: PrismaClient;

  constructor(
    entryService?: EntryService | null,
    conversationService?: ConversationService | null,
    prisma?: PrismaClient
  ) {
    // Allow null services for testing formatting methods
    this.entryService = entryService === null ? null : (entryService || getEntryService());
    this.conversationService = conversationService === null ? null : (conversationService || getConversationService());
    this.prisma = prisma || getPrismaClient();
  }

  /**
   * Get stale projects that haven't been updated in STALE_DAYS
   * @param staleDays - Number of days to consider a project stale
   * @returns Array of stale projects sorted by staleness (oldest first), limited to 5
   */
  async getStaleProjects(staleDays?: number): Promise<StaleProject[]> {
    if (!this.entryService) {
      throw new Error('EntryService not available');
    }

    const config = getConfig();
    const threshold = staleDays ?? config.STALE_DAYS;
    const now = new Date();

    // Load all projects via EntryService
    const projects = await this.entryService.list('projects');

    // Filter and transform to StaleProject
    const staleProjects: StaleProject[] = [];
    const validStatuses: ProjectStatus[] = ['active', 'waiting', 'blocked'];

    for (const project of projects) {
      // Filter by status: active, waiting, blocked
      if (!project.status || !validStatuses.includes(project.status as ProjectStatus)) {
        continue;
      }

      // Calculate days since updated_at
      const updatedAt = new Date(project.updated_at);
      const daysSinceUpdate = Math.floor(
        (now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Filter where daysSinceUpdate > STALE_DAYS
      if (daysSinceUpdate > threshold) {
        staleProjects.push({
          name: project.name,
          status: project.status as 'active' | 'waiting' | 'blocked',
          daysSinceUpdate,
          path: project.path
        });
      }
    }

    // Sort by daysSinceUpdate descending (oldest first)
    staleProjects.sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

    // Limit to 5 projects
    return staleProjects.slice(0, 5);
  }

  /**
   * Format stale projects into a markdown message
   * @param staleProjects - Array of stale projects to format
   * @returns Formatted markdown string
   */
  formatStaleCheck(staleProjects: StaleProject[]): string {
    const lines: string[] = [
      '**🔍 Stale Project Check**',
      '',
      "These projects haven't been updated in a while:",
      ''
    ];

    for (const project of staleProjects) {
      lines.push(`- **${project.name}** (${project.status}) – ${project.daysSinceUpdate} days since last update`);
    }

    lines.push('');
    lines.push('Consider reviewing these to keep things moving.');

    return lines.join('\n');
  }

  /**
   * Generate stale project check content
   * @returns Content string if stale projects found, null otherwise
   */
  async generateStaleCheck(): Promise<string | null> {
    const staleProjects = await this.getStaleProjects();

    // Flag stale projects in entries without changing updated_at
    await this.syncStaleFlags(staleProjects);

    // If empty, return null (no message)
    if (staleProjects.length === 0) {
      return null;
    }

    // Format output using template
    return this.formatStaleCheck(staleProjects);
  }

  /**
   * Sync stale flags on project entries without updating updated_at
   */
  private async syncStaleFlags(staleProjects: StaleProject[]): Promise<void> {
    if (!this.entryService) {
      throw new Error('EntryService not available');
    }

    const staleSet = new Set(staleProjects.map(p => p.path));
    const allProjects = await this.entryService.list('projects');

    for (const project of allProjects) {
      const full = await this.entryService.read(project.path);
      const entry = full.entry as { stale?: boolean; stale_since?: string };
      const shouldBeStale = staleSet.has(project.path);
      const isStale = entry.stale === true;

      if (shouldBeStale && !isStale) {
        await this.entryService.update(
          project.path,
          {
            stale: true,
            stale_since: new Date().toISOString().split('T')[0]
          } as any,
          'api',
          undefined,
          { preserveUpdatedAt: true }
        );
      }

      if (!shouldBeStale && isStale) {
        await this.entryService.update(
          project.path,
          { stale: false } as any,
          'api',
          undefined,
          { preserveUpdatedAt: true }
        );
      }
    }
  }

  /**
   * Get people with pending follow-ups
   * @returns Array of people with follow-ups sorted by last_touched (oldest first), limited to 5
   * 
   * Requirements: 2.2, 2.5, 2.6
   */
  async getPeopleWithFollowUps(): Promise<FollowUpPerson[]> {
    if (!this.entryService) {
      throw new Error('EntryService not available');
    }

    const now = new Date();

    // Load all people entries via EntryService
    const peopleSummaries = await this.entryService.list('people');

    // Filter and transform to FollowUpPerson
    const peopleWithFollowUps: FollowUpPerson[] = [];

    for (const summary of peopleSummaries) {
      // Read full entry to get follow_ups array
      const fullEntry = await this.entryService.read(summary.path);
      const peopleEntry = fullEntry.entry as { follow_ups?: string[]; last_touched?: string; name: string };

      const normalizedFollowUps = (peopleEntry.follow_ups || [])
        .map((item) => item.trim())
        .filter(Boolean);

      // Filter to entries with non-empty follow_ups array
      if (normalizedFollowUps.length === 0) {
        continue;
      }

      // Calculate days since last_touched
      let daysSinceContact = 0;
      if (peopleEntry.last_touched) {
        const lastTouched = new Date(peopleEntry.last_touched);
        daysSinceContact = Math.floor(
          (now.getTime() - lastTouched.getTime()) / (1000 * 60 * 60 * 24)
        );
      } else {
        // If no last_touched, treat as very old (high priority)
        daysSinceContact = Number.MAX_SAFE_INTEGER;
      }

      // Limit to 2 follow-up items per person (Requirement 2.6)
      const limitedFollowUps = normalizedFollowUps.slice(0, 2);

      peopleWithFollowUps.push({
        name: peopleEntry.name,
        followUps: limitedFollowUps,
        lastTouched: peopleEntry.last_touched || null,
        daysSinceContact
      });
    }

    // Sort by daysSinceContact descending (oldest first) - Requirement 2.5
    peopleWithFollowUps.sort((a, b) => b.daysSinceContact - a.daysSinceContact);

    // Limit to 5 people - Requirement 2.5
    return peopleWithFollowUps.slice(0, 5);
  }

  /**
   * Format follow-up reminder into a markdown message
   * @param people - Array of people with follow-ups to format
   * @returns Formatted markdown string
   * 
   * Requirements: 2.3
   */
  formatFollowUpReminder(people: FollowUpPerson[]): string {
    const lines: string[] = [
      '**👋 Follow-up Reminder**',
      '',
      'You have pending follow-ups with:',
      ''
    ];

    for (const person of people) {
      // Format days since contact
      const daysText = person.daysSinceContact === Number.MAX_SAFE_INTEGER
        ? 'unknown'
        : `${person.daysSinceContact}`;
      
      lines.push(`**${person.name}** (last contact: ${daysText} days ago)`);
      
      // Add follow-up items (already limited to 2 in getPeopleWithFollowUps)
      for (const followUp of person.followUps) {
        lines.push(`  - ${followUp}`);
      }
    }

    lines.push('');
    lines.push('Reply to mark any as done or add notes.');

    return lines.join('\n');
  }

  /**
   * Generate follow-up reminder content
   * @returns Content string if follow-ups found, null otherwise
   * 
   * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6
   */
  async generateFollowUpReminder(): Promise<string | null> {
    const peopleWithFollowUps = await this.getPeopleWithFollowUps();

    // If empty, return null (no message) - Requirement 2.4
    if (peopleWithFollowUps.length === 0) {
      return null;
    }

    // Format output using template - Requirement 2.3
    return this.formatFollowUpReminder(peopleWithFollowUps);
  }

  /**
   * Check if user has been active (has messages) within the inactivity threshold
   * @param inactivityDays - Number of days to check for activity
   * @returns true if user is active (has messages), false otherwise
   * 
   * Requirements: 3.2
   */
  async checkUserActivity(inactivityDays?: number): Promise<boolean> {
    const config = getConfig();
    const threshold = inactivityDays ?? config.INACTIVITY_DAYS;
    const userId = requireUserId();
    
    // Calculate threshold date (now - INACTIVITY_DAYS)
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - threshold);

    // Query Message table for user messages since threshold
    const userMessageCount = await this.prisma.message.count({
      where: {
        userId,
        createdAt: {
          gte: thresholdDate
        },
        role: 'user'
      }
    });

    // Return true if user is active (has messages), false otherwise
    return userMessageCount > 0;
  }

  /**
   * Get a random nudge message variation
   * @param days - Number of days since last activity
   * @returns A formatted nudge message string
   * 
   * Requirements: 3.5
   */
  getNudgeMessage(days: number): string {
    const variations = [
      // Variation 1
      `**💭 Quick thought?**

It's been ${days} days since your last capture. Even a small thought counts!

Reply with anything on your mind.`,

      // Variation 2
      `**🌱 Time to capture?**

Your second brain misses you! ${days} days without a new thought.

What's one thing you're working on right now?`,

      // Variation 3
      `**📝 Gentle nudge**

Haven't heard from you in ${days} days. No pressure, but your future self will thank you for capturing that idea floating around.

What's on your mind?`
    ];

    // Select random nudge message from variations
    const randomIndex = Math.floor(Math.random() * variations.length);
    return variations[randomIndex];
  }

  /**
   * Generate inactivity nudge content
   * @returns Content string if user inactive, null otherwise
   * 
   * Requirements: 3.2, 3.3, 3.4, 3.5
   */
  async generateInactivityNudge(): Promise<string | null> {
    const config = getConfig();
    const inactivityDays = config.INACTIVITY_DAYS;

    // Check if user is active
    const isActive = await this.checkUserActivity(inactivityDays);

    // If user is active, return null (no message) - Requirement 3.4
    if (isActive) {
      return null;
    }

    // Generate a nudge message - Requirements 3.3, 3.5
    return this.getNudgeMessage(inactivityDays);
  }

  /**
   * Deliver proactive content to chat as an assistant message
   * Reuses existing conversation if one exists, or creates a new one if not
   * @param content - The markdown content to deliver
   * 
   * Requirements: 5.1, 5.2, 5.3
   */
  async deliverToChat(content: string): Promise<void> {
    if (!this.conversationService) {
      throw new Error('ConversationService not available');
    }

    // Get or create a chat conversation (reuse pattern from DigestService)
    let conversation = await this.conversationService.getMostRecent('chat');

    if (!conversation) {
      conversation = await this.conversationService.create('chat');
    }

    // Add the proactive message as an assistant message (markdown formatted)
    await this.conversationService.addMessage(
      conversation.id,
      'assistant',
      content
    );
  }
}

// ============================================
// Singleton Instance
// ============================================

let proactiveServiceInstance: ProactiveService | null = null;

/**
 * Get the ProactiveService singleton instance
 */
export function getProactiveService(): ProactiveService {
  if (!proactiveServiceInstance) {
    proactiveServiceInstance = new ProactiveService();
  }
  return proactiveServiceInstance;
}

/**
 * Reset the singleton instance (useful for testing)
 */
export function resetProactiveService(): void {
  proactiveServiceInstance = null;
}

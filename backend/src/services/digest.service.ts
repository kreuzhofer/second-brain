/**
 * Digest Service
 * Generates daily digests and weekly reviews for the Second Brain application.
 * Implements proactive surfacing of relevant information.
 */

import { getConfig } from '../config/env';
import { EntryService, getEntryService } from './entry.service';
import { IndexService, getIndexService } from './index.service';
import { ConversationService, getConversationService } from './conversation.service';
import { DigestMailer, getDigestMailer } from './digest-mailer';
import { DailyTipService, getDailyTipService } from './daily-tip.service';
import { getPrismaClient } from '../lib/prisma';
import { PrismaClient } from '@prisma/client';
import { EntrySummary, Category } from '../types/entry.types';
import { DigestPreferences, DigestPreferencesService, getDigestPreferencesService } from './digest-preferences.service';
import { requireUserId } from '../context/user-context';
import { isTaskCategory } from '../utils/category';

// ============================================
// Types
// ============================================

export interface ActivityStats {
  messagesCount: number;
  entriesCreated: {
    people: number;
    projects: number;
    ideas: number;
    task: number;
    total: number;
  };
  tasksCompleted: number;
}

export interface TopItem {
  name: string;
  nextAction: string;
  source: 'project' | 'task';
  dueDate?: string;
}

export interface StaleInboxItem {
  name: string;
  originalText: string;
  daysInInbox: number;
}

export interface OpenLoop {
  name: string;
  reason: string;
  age: number; // days
}

export interface Suggestion {
  text: string;
  reason: string;
}

export interface DigestNudge {
  entryId: string;
  path: string;
  name: string;
  reason: string;
  score: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// ============================================
// Digest Service Class
// ============================================

export class DigestService {
  private entryService: EntryService | null;
  private indexService: IndexService | null;
  private conversationService: ConversationService | null;
  private digestMailer: DigestMailer | null;
  private preferencesService: DigestPreferencesService;
  private dailyTipService: DailyTipService;
  private prisma: PrismaClient;

  constructor(
    entryService?: EntryService | null,
    indexService?: IndexService | null,
    conversationService?: ConversationService | null,
    digestMailer?: DigestMailer | null,
    preferencesService?: DigestPreferencesService,
    dailyTipService?: DailyTipService,
    prisma?: PrismaClient
  ) {
    // Allow null services for testing formatting methods
    this.entryService = entryService === null ? null : (entryService || getEntryService());
    this.indexService = indexService === null ? null : (indexService || getIndexService());
    this.conversationService = conversationService === null ? null : (conversationService || getConversationService());
    this.digestMailer = digestMailer === null ? null : (digestMailer || getDigestMailer());
    this.preferencesService = preferencesService || getDigestPreferencesService();
    this.dailyTipService = dailyTipService || getDailyTipService();
    this.prisma = prisma || getPrismaClient();
  }

  /**
   * Generate a daily digest
   * @returns The formatted digest content as markdown
   */
  async generateDailyDigest(preferences?: DigestPreferences): Promise<string> {
    const config = getConfig();
    const prefs = await this.preferencesService.getMergedPreferences(preferences);
    
    // Get top 3 items (active projects + pending tasks)
    const topItems = await this.getTopItems(prefs);
    
    // Get stale inbox items
    const staleItems = prefs.includeStaleInbox && this.isCategoryFocused(prefs, 'inbox')
      ? await this.getStaleInboxItems(config.STALE_INBOX_DAYS)
      : [];
    
    // Get small wins (completed tasks in last 7 days)
    const smallWins = prefs.includeSmallWins && this.isCategoryFocused(prefs, 'task')
      ? await this.getSmallWins()
      : { completedCount: 0 };
    
    // Smart nudges
    const nudges = prefs.includeNudges
      ? await this.getSmartNudges(prefs)
      : [];

    // Daily momentum tip
    let tipResult: { tip: string; source: 'ai' | 'fallback' } | undefined;
    try {
      tipResult = await this.dailyTipService.getNextTip('daily');
    } catch (error) {
      console.warn('DigestService: Failed to load daily tip', error);
      tipResult = undefined;
    }

    // Format the digest
    const tipLabel = tipResult?.source === 'fallback' ? 'Daily Momentum Tip (fallback)' : 'Daily Momentum Tip';
    let digest = this.formatDailyDigest(topItems, staleItems, smallWins, nudges, tipResult?.tip, tipLabel);
    if (prefs.maxWords) {
      digest = this.applyWordLimit(digest, prefs.maxWords);
    }
    return digest;
  }

  /**
   * Generate a weekly review
   * @returns The formatted review content as markdown
   */
  async generateWeeklyReview(preferences?: DigestPreferences): Promise<string> {
    const prefs = await this.preferencesService.getMergedPreferences(preferences);
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Get activity stats
    const stats = await this.getActivityStats(weekAgo, now, prefs);
    
    // Get open loops
    const openLoops = prefs.includeOpenLoops ? await this.getOpenLoops(prefs) : [];
    
    // Get suggestions
    const suggestions = prefs.includeSuggestions ? await this.getSuggestions(prefs) : [];
    
    // Identify theme
    const theme = prefs.includeTheme ? await this.identifyTheme(weekAgo, now, prefs) : 'Theme disabled for this digest.';

    // Weekly momentum tip
    let weeklyTipResult: { tip: string; source: 'ai' | 'fallback' } | undefined;
    try {
      weeklyTipResult = await this.dailyTipService.getNextTip('weekly');
    } catch (error) {
      console.warn('DigestService: Failed to load weekly tip', error);
      weeklyTipResult = undefined;
    }
    
    // Format the review
    const weeklyTipLabel = weeklyTipResult?.source === 'fallback' ? 'Weekly Momentum Tip (fallback)' : 'Weekly Momentum Tip';
    let review = this.formatWeeklyReview(
      weekAgo,
      now,
      stats,
      openLoops,
      suggestions,
      theme,
      weeklyTipResult?.tip,
      weeklyTipLabel
    );
    if (prefs.maxWords) {
      review = this.applyWordLimit(review, prefs.maxWords);
    }
    return review;
  }

  /**
   * Get activity statistics for a date range
   */
  async getActivityStats(startDate: Date, endDate: Date, preferences?: DigestPreferences): Promise<ActivityStats> {
    if (!this.entryService) {
      throw new Error('EntryService not available');
    }
    const userId = requireUserId();
    
    // Count user messages in date range
    const messagesCount = await this.prisma.message.count({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lt: endDate
        },
        role: 'user'
      }
    });

    // Get all entries and filter by date
    const allEntries = await this.entryService.list();
    const entriesInRange = allEntries.filter(e => {
      const createdAt = new Date(e.updated_at);
      const inRange = createdAt >= startDate && createdAt < endDate;
      if (!inRange) return false;
      if (preferences?.focusCategories && preferences.focusCategories.length > 0) {
        return this.isCategoryFocused(preferences, e.category as Category);
      }
      return true;
    });

    const entriesCreated = {
      people: entriesInRange.filter(e => e.category === 'people').length,
      projects: entriesInRange.filter(e => e.category === 'projects').length,
      ideas: entriesInRange.filter(e => e.category === 'ideas').length,
      task: entriesInRange.filter(e => isTaskCategory(e.category)).length,
      total: entriesInRange.length
    };

    // Count completed tasks
    const taskEntries = await this.entryService.list('task');
    const tasksCompleted = taskEntries.filter(e => {
      const updatedAt = new Date(e.updated_at);
      return e.status === 'done' && updatedAt >= startDate && updatedAt < endDate;
    }).length;

    return {
      messagesCount,
      entriesCreated,
      tasksCompleted
    };
  }

  /**
   * Get top 3 priority items (active projects and pending tasks)
   */
  async getTopItems(preferences?: DigestPreferences): Promise<TopItem[]> {
    if (!this.entryService) {
      throw new Error('EntryService not available');
    }
    
    const items: TopItem[] = [];

    // Get active projects
    if (this.isCategoryFocused(preferences, 'projects')) {
      const projects = await this.entryService.list('projects', { status: 'active' });
      for (const project of projects) {
        if (project.next_action) {
          items.push({
            name: project.name,
            nextAction: project.next_action,
            source: 'project',
            dueDate: project.due_date
          });
        }
      }
    }

    // Get pending tasks
    if (this.isCategoryFocused(preferences, 'task')) {
      const tasks = await this.entryService.list('task', { status: 'pending' });
      for (const task of tasks) {
        items.push({
          name: task.name,
          nextAction: task.name,
          source: 'task',
          dueDate: task.due_date
        });
      }
    }

    // Sort by due date (earliest first, items with due dates before items without)
    items.sort((a, b) => {
      if (!a.dueDate && !b.dueDate) return 0;
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

    const limit = preferences?.maxItems ?? 3;
    return items.slice(0, limit);
  }

  /**
   * Get stale inbox items (older than threshold days)
   */
  async getStaleInboxItems(thresholdDays: number): Promise<StaleInboxItem[]> {
    if (!this.entryService) {
      throw new Error('EntryService not available');
    }
    
    const now = new Date();
    const threshold = new Date(now.getTime() - thresholdDays * 24 * 60 * 60 * 1000);
    
    const inboxItems = await this.entryService.list('inbox');
    const staleItems: StaleInboxItem[] = [];

    for (const item of inboxItems) {
      const createdAt = new Date(item.updated_at);
      if (createdAt < threshold) {
        const daysInInbox = Math.floor((now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000));
        staleItems.push({
          name: item.name,
          originalText: item.original_text || item.name,
          daysInInbox
        });
      }
    }

    return staleItems;
  }

  /**
   * Get small wins (completed tasks in last 7 days)
   */
  async getSmallWins(): Promise<{ completedCount: number; nextTask?: string }> {
    if (!this.entryService) {
      throw new Error('EntryService not available');
    }
    
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const adminTasks = await this.entryService.list('task');
    
    // Count completed tasks in last 7 days
    const completedCount = adminTasks.filter(task => {
      const updatedAt = new Date(task.updated_at);
      return task.status === 'done' && updatedAt >= weekAgo;
    }).length;

    // Find next pending task
    const pendingTasks = adminTasks.filter(task => task.status === 'pending');
    pendingTasks.sort((a, b) => {
      if (!a.due_date && !b.due_date) return 0;
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });

    return {
      completedCount,
      nextTask: pendingTasks[0]?.name
    };
  }

  /**
   * Get smart nudges based on deadlines, inactivity, and priority decay
   */
  async getSmartNudges(preferences: DigestPreferences): Promise<DigestNudge[]> {
    if (!this.entryService) {
      throw new Error('EntryService not available');
    }

    if (preferences.includeNudges === false) {
      return [];
    }

    const maxNudges = preferences.maxNudgesPerDay ?? 3;
    if (maxNudges <= 0) {
      return [];
    }

    const now = new Date();
    const candidates: DigestNudge[] = [];

    if (this.isCategoryFocused(preferences, 'task')) {
      const tasks = await this.entryService.list('task', { status: 'pending' });
      for (const task of tasks) {
        const candidate = this.buildNudgeCandidate(task, now, { usePriority: true });
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }

    if (this.isCategoryFocused(preferences, 'projects')) {
      const projects = await this.entryService.list('projects', { status: 'active' });
      for (const project of projects) {
        const candidate = this.buildNudgeCandidate(project, now, { usePriority: false });
        if (candidate) {
          candidates.push(candidate);
        }
      }
    }

    if (candidates.length === 0) {
      return [];
    }

    const userId = requireUserId();
    const cooldownDays = preferences.nudgeCooldownDays ?? 3;
    const cutoff = new Date(now.getTime() - cooldownDays * DAY_MS);
    const candidateIds = candidates.map((candidate) => candidate.entryId);
    const recent = await this.prisma.entryNudge.findMany({
      where: {
        userId,
        entryId: { in: candidateIds }
      },
      select: {
        entryId: true,
        lastNudgedAt: true
      }
    });

    const suppressed = new Set(
      recent
        .filter((record) => record.lastNudgedAt >= cutoff)
        .map((record) => record.entryId)
    );

    const available = candidates.filter((candidate) => !suppressed.has(candidate.entryId));
    available.sort((a, b) => b.score - a.score);
    const selected = available.slice(0, maxNudges);

    if (selected.length === 0) {
      return [];
    }

    await Promise.all(
      selected.map((nudge) =>
        this.prisma.entryNudge.upsert({
          where: {
            userId_entryId: {
              userId,
              entryId: nudge.entryId
            }
          },
          create: {
            userId,
            entryId: nudge.entryId,
            lastNudgedAt: now,
            lastReason: nudge.reason
          },
          update: {
            lastNudgedAt: now,
            lastReason: nudge.reason
          }
        })
      )
    );

    return selected;
  }

  private buildNudgeCandidate(
    entry: EntrySummary,
    now: Date,
    options: { usePriority: boolean }
  ): DigestNudge | null {
    const reasons: Array<{ score: number; text: string }> = [];

    const dueInfo = this.getDueDateForEntry(entry);
    if (dueInfo) {
      const anchor = dueInfo.source === 'date' ? this.getStartOfTodayUtc(now) : now;
      const daysUntilDue = Math.floor((dueInfo.date.getTime() - anchor.getTime()) / DAY_MS);

      if (daysUntilDue < 0) {
        const daysOverdue = Math.abs(daysUntilDue);
        reasons.push({
          score: 110 + Math.min(daysOverdue, 7),
          text: `Overdue by ${daysOverdue} ${this.formatDays(daysOverdue)}`
        });
      } else if (daysUntilDue === 0) {
        reasons.push({ score: 100, text: 'Due today' });
      } else if (daysUntilDue === 1) {
        reasons.push({ score: 95, text: 'Due tomorrow' });
      } else if (daysUntilDue <= 3) {
        reasons.push({
          score: 85,
          text: `Due in ${daysUntilDue} ${this.formatDays(daysUntilDue)}`
        });
      } else if (daysUntilDue <= 7) {
        reasons.push({
          score: 70,
          text: `Due in ${daysUntilDue} ${this.formatDays(daysUntilDue)}`
        });
      }
    }

    const updatedAt = new Date(entry.updated_at);
    if (!isNaN(updatedAt.getTime())) {
      const daysSinceUpdate = Math.floor((now.getTime() - updatedAt.getTime()) / DAY_MS);
      if (daysSinceUpdate >= 7) {
        reasons.push({
          score: 55 + Math.min(daysSinceUpdate - 7, 10),
          text: `No update in ${daysSinceUpdate} ${this.formatDays(daysSinceUpdate)}`
        });
      }

      if (options.usePriority) {
        const priority = entry.priority ?? 3;
        if (priority >= 4 && daysSinceUpdate >= 5) {
          reasons.push({
            score: 45 + (priority - 3) * 10 + Math.min(daysSinceUpdate - 5, 5),
            text: `High priority, last touched ${daysSinceUpdate} ${this.formatDays(daysSinceUpdate)} ago`
          });
        }
      }
    }

    if (reasons.length === 0) {
      return null;
    }

    const best = reasons.sort((a, b) => b.score - a.score)[0];
    return {
      entryId: entry.id,
      path: entry.path,
      name: entry.name,
      reason: best.text,
      score: best.score
    };
  }

  private getDueDateForEntry(entry: EntrySummary): { date: Date; source: 'date' | 'datetime' } | null {
    if (entry.due_at) {
      const dueAt = new Date(entry.due_at);
      if (!isNaN(dueAt.getTime())) {
        return { date: dueAt, source: 'datetime' };
      }
    }

    if (entry.due_date) {
      const parsed = this.parseYmdAsUtc(entry.due_date);
      if (parsed) {
        return { date: parsed, source: 'date' };
      }
    }

    return null;
  }

  private parseYmdAsUtc(value: string): Date | null {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return null;
    }
    return date;
  }

  private getStartOfTodayUtc(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }

  private formatDays(days: number): string {
    return days === 1 ? 'day' : 'days';
  }

  /**
   * Get open loops (waiting/blocked projects and stale inbox items)
   */
  async getOpenLoops(preferences?: DigestPreferences): Promise<OpenLoop[]> {
    if (!this.entryService) {
      throw new Error('EntryService not available');
    }
    
    const loops: OpenLoop[] = [];
    const now = new Date();
    const config = getConfig();

    // Get waiting/blocked projects
    if (this.isCategoryFocused(preferences, 'projects')) {
      const projects = await this.entryService.list('projects');
      const waitingProjects = projects.filter(p => 
        p.status === 'waiting' || p.status === 'blocked'
      );

      for (const project of waitingProjects) {
        const updatedAt = new Date(project.updated_at);
        const age = Math.floor((now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));
        loops.push({
          name: project.name,
          reason: project.status === 'waiting' ? 'waiting' : 'blocked',
          age
        });
      }
    }

    // Get stale inbox items
    if (this.isCategoryFocused(preferences, 'inbox')) {
      const staleItems = await this.getStaleInboxItems(config.STALE_INBOX_DAYS);
      for (const item of staleItems) {
        loops.push({
          name: item.name,
          reason: 'in inbox',
          age: item.daysInInbox
        });
      }
    }

    // Sort by age (oldest first) and take top 3
    loops.sort((a, b) => b.age - a.age);
    const limit = preferences?.maxOpenLoops ?? 3;
    return loops.slice(0, limit);
  }

  /**
   * Get suggestions for focus areas
   */
  async getSuggestions(preferences?: DigestPreferences): Promise<Suggestion[]> {
    if (!this.entryService) {
      throw new Error('EntryService not available');
    }
    
    const suggestions: Suggestion[] = [];
    const now = new Date();
    const config = getConfig();

    // Check for inbox items needing resolution
    if (this.isCategoryFocused(preferences, 'inbox')) {
      const inboxItems = await this.entryService.list('inbox');
      if (inboxItems.length > 0) {
        suggestions.push({
          text: 'Resolve inbox items',
          reason: `${inboxItems.length} item${inboxItems.length > 1 ? 's' : ''} need${inboxItems.length === 1 ? 's' : ''} review`
        });
      }
    }

    // Check for people with old last_touched dates
    if (this.isCategoryFocused(preferences, 'people')) {
      const people = await this.entryService.list('people');
      const stalePeople = people.filter(p => {
        if (!p.last_touched) return false;
        const lastTouched = new Date(p.last_touched);
        const daysSince = Math.floor((now.getTime() - lastTouched.getTime()) / (24 * 60 * 60 * 1000));
        return daysSince > 7;
      });

      if (stalePeople.length > 0) {
        const oldestPerson = stalePeople.sort((a, b) => {
          const aDate = new Date(a.last_touched || 0);
          const bDate = new Date(b.last_touched || 0);
          return aDate.getTime() - bDate.getTime();
        })[0];
        
        const daysSince = Math.floor(
          (now.getTime() - new Date(oldestPerson.last_touched || 0).getTime()) / (24 * 60 * 60 * 1000)
        );
        
        suggestions.push({
          text: `Follow up with ${oldestPerson.name}`,
          reason: `last contact: ${daysSince} days ago`
        });
      }
    }

    // Check for active projects without due dates
    if (this.isCategoryFocused(preferences, 'projects')) {
      const projects = await this.entryService.list('projects', { status: 'active' });
      const projectsWithoutDueDate = projects.filter(p => !p.due_date);
      if (projectsWithoutDueDate.length > 0) {
        suggestions.push({
          text: `Set deadline for ${projectsWithoutDueDate[0].name}`,
          reason: 'no due date set'
        });
      }
    }

    const limit = preferences?.maxSuggestions ?? 3;
    return suggestions.slice(0, limit);
  }

  /**
   * Identify theme from the week's activity
   */
  async identifyTheme(startDate: Date, endDate: Date, preferences?: DigestPreferences): Promise<string> {
    if (!this.entryService) {
      throw new Error('EntryService not available');
    }
    
    const allEntries = await this.entryService.list();
    const entriesInRange = allEntries.filter(e => {
      const createdAt = new Date(e.updated_at);
      const inRange = createdAt >= startDate && createdAt < endDate;
      if (!inRange) return false;
      if (preferences?.focusCategories && preferences.focusCategories.length > 0) {
        return this.isCategoryFocused(preferences, e.category as Category);
      }
      return true;
    });

    if (entriesInRange.length === 0) {
      return 'No activity this week. Time to capture some thoughts!';
    }

    // Count by category
    const categoryCounts: Record<string, number> = {};
    for (const entry of entriesInRange) {
      categoryCounts[entry.category] = (categoryCounts[entry.category] || 0) + 1;
    }

    // Find dominant category
    const sortedCategories = Object.entries(categoryCounts)
      .sort((a, b) => b[1] - a[1]);
    
    const [topCategory, topCount] = sortedCategories[0];
    const percentage = Math.round((topCount / entriesInRange.length) * 100);

    const categoryDescriptions: Record<string, string> = {
      people: 'relationship-focused',
      projects: 'project-focused',
      ideas: 'creative and exploratory',
      task: 'task-oriented',
      inbox: 'capturing lots of raw thoughts'
    };

    return `Most activity this week was ${categoryDescriptions[topCategory] || topCategory} (${percentage}% of entries).`;
  }

  /**
   * Format daily digest content
   */
  formatDailyDigest(
    topItems: TopItem[],
    staleItems: StaleInboxItem[],
    smallWins: { completedCount: number; nextTask?: string },
    nudges: DigestNudge[] = [],
    dailyTip?: string,
    dailyTipLabel: string = 'Daily Momentum Tip'
  ): string {
    const lines: string[] = [];
    
    lines.push('Good morning.');
    lines.push('');
    lines.push('**Top 3 for Today:**');
    
    if (topItems.length === 0) {
      lines.push('No active items. Time to capture some thoughts!');
    } else {
      topItems.forEach((item, index) => {
        const suffix = item.source === 'project' ? ` (${item.name})` : '';
        const action = item.source === 'project' ? item.nextAction : item.name;
        lines.push(`${index + 1}. ${action}${suffix}`);
      });
    }

    if (staleItems.length > 0) {
      lines.push('');
      lines.push('**Might Be Stuck:**');
      for (const item of staleItems) {
        const text = item.originalText.length > 40 
          ? item.originalText.substring(0, 40) + '...'
          : item.originalText;
        lines.push(`- "${text}" has been in inbox for ${item.daysInInbox} days. Want to clarify?`);
      }
    }

    if (smallWins.completedCount > 0) {
      lines.push('');
      lines.push('**Small Win:**');
      const nextPart = smallWins.nextTask ? ` ${smallWins.nextTask} is next.` : '';
      lines.push(`- You completed ${smallWins.completedCount} task${smallWins.completedCount > 1 ? 's' : ''} this week.${nextPart}`);
    }

    if (nudges.length > 0) {
      lines.push('');
      lines.push('**Smart Nudges:**');
      nudges.forEach((nudge, index) => {
        lines.push(`${index + 1}. ${nudge.name} — ${nudge.reason}`);
      });
    }

    if (dailyTip) {
      lines.push('');
      lines.push(`**${dailyTipLabel}:**`);
      lines.push(`- ${dailyTip}`);
    }

    lines.push('');
    lines.push('---');
    lines.push('Reply to this message to capture a thought.');

    return lines.join('\n');
  }

  /**
   * Format weekly review content
   */
  formatWeeklyReview(
    startDate: Date,
    endDate: Date,
    stats: ActivityStats,
    openLoops: OpenLoop[],
    suggestions: Suggestion[],
    theme: string,
    weeklyTip?: string,
    weeklyTipLabel: string = 'Weekly Momentum Tip'
  ): string {
    const lines: string[] = [];
    
    const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
    lines.push(`# Week of ${formatDate(startDate)} - ${formatDate(endDate)}, ${endDate.getFullYear()}`);
    lines.push('');
    
    lines.push('**What Happened:**');
    lines.push(`- ${stats.messagesCount} thoughts captured`);
    
    const breakdown = [];
    if (stats.entriesCreated.projects > 0) breakdown.push(`${stats.entriesCreated.projects} projects`);
    if (stats.entriesCreated.people > 0) breakdown.push(`${stats.entriesCreated.people} people`);
    if (stats.entriesCreated.ideas > 0) breakdown.push(`${stats.entriesCreated.ideas} ideas`);
    if (stats.entriesCreated.task > 0) breakdown.push(`${stats.entriesCreated.task} tasks`);
    
    const breakdownStr = breakdown.length > 0 ? ` (${breakdown.join(', ')})` : '';
    lines.push(`- ${stats.entriesCreated.total} entries created${breakdownStr}`);
    lines.push(`- ${stats.tasksCompleted} tasks completed`);
    lines.push('');

    lines.push('**Biggest Open Loops:**');
    if (openLoops.length === 0) {
      lines.push('No open loops. Great job staying on top of things!');
    } else {
      openLoops.forEach((loop, index) => {
        lines.push(`${index + 1}. ${loop.name} – ${loop.reason}`);
      });
    }
    lines.push('');

    lines.push('**Suggested Focus for Next Week:**');
    if (suggestions.length === 0) {
      lines.push('Keep up the momentum!');
    } else {
      suggestions.forEach((suggestion, index) => {
        lines.push(`${index + 1}. ${suggestion.text}`);
      });
    }
    lines.push('');

    if (weeklyTip) {
      lines.push(`**${weeklyTipLabel}:**`);
      lines.push(`- ${weeklyTip}`);
      lines.push('');
    }

    lines.push('**Theme I Noticed:**');
    lines.push(theme);
    lines.push('');

    lines.push('---');
    lines.push('Reply with thoughts or adjustments.');

    return lines.join('\n');
  }

  /**
   * Deliver digest content to chat
   */
  async deliverToChat(content: string): Promise<void> {
    if (!this.conversationService) {
      throw new Error('ConversationService not available');
    }
    
    // Get or create a chat conversation
    let conversation = await this.conversationService.getMostRecent('chat');
    
    if (!conversation) {
      conversation = await this.conversationService.create('chat');
    }

    // Add the digest as an assistant message
    await this.conversationService.addMessage(
      conversation.id,
      'assistant',
      content
    );
  }

  /**
   * Deliver daily digest via email
   * Skips silently if email is not configured (Requirement 6.5)
   * Does not block digest generation on email delivery
   * 
   * @param recipientEmail - Email address to send digest to
   * @param content - Digest content (markdown)
   * @returns true if email was sent, false if skipped or failed
   */
  async deliverDailyDigestToEmail(recipientEmail: string, content: string): Promise<boolean> {
    if (!this.digestMailer) {
      return false; // Skip silently
    }

    try {
      const result = await this.digestMailer.sendDailyDigest(recipientEmail, content);
      return result.success && !result.skipped;
    } catch (error) {
      // Log but don't throw - email delivery shouldn't block digest generation
      console.error('DigestService: Failed to send daily digest email:', error);
      return false;
    }
  }

  /**
   * Deliver weekly review via email
   * Skips silently if email is not configured (Requirement 6.5)
   * Does not block digest generation on email delivery
   * 
   * @param recipientEmail - Email address to send review to
   * @param content - Review content (markdown)
   * @param startDate - Start of the week
   * @param endDate - End of the week
   * @returns true if email was sent, false if skipped or failed
   */
  async deliverWeeklyReviewToEmail(
    recipientEmail: string,
    content: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<boolean> {
    if (!this.digestMailer) {
      return false; // Skip silently
    }

    try {
      const result = await this.digestMailer.sendWeeklyReview(recipientEmail, content, startDate, endDate);
      return result.success && !result.skipped;
    } catch (error) {
      // Log but don't throw - email delivery shouldn't block digest generation
      console.error('DigestService: Failed to send weekly review email:', error);
      return false;
    }
  }

  /**
   * Count words in a string
   */
  countWords(text: string): number {
    return text.split(/\s+/).filter(word => word.length > 0).length;
  }

  private applyWordLimit(text: string, maxWords: number): string {
    if (!maxWords || maxWords <= 0) return text;
    const words = text.split(/\s+/).filter(word => word.length > 0);
    if (words.length <= maxWords) return text;
    return words.slice(0, maxWords).join(' ') + '…';
  }

  private isCategoryFocused(preferences: DigestPreferences | undefined, category: Category): boolean {
    if (!preferences?.focusCategories || preferences.focusCategories.length === 0) {
      return true;
    }
    if (isTaskCategory(category)) {
      return preferences.focusCategories.includes('task') || preferences.focusCategories.includes('admin' as Category);
    }
    return preferences.focusCategories.includes(category);
  }
}

// ============================================
// Singleton Instance
// ============================================

let digestServiceInstance: DigestService | null = null;

export function getDigestService(): DigestService {
  if (!digestServiceInstance) {
    digestServiceInstance = new DigestService();
  }
  return digestServiceInstance;
}

export function resetDigestService(): void {
  digestServiceInstance = null;
}

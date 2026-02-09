import jwt, { Secret, SignOptions, JwtPayload } from 'jsonwebtoken';
import { getPrismaClient } from '../lib/prisma';
import { getConfig } from '../config/env';
import { Category } from '../types/entry.types';

export interface WeekPlanOptions {
  startDate?: string;
  days?: number;
}

export interface WeekPlanItem {
  entryPath: string;
  category: Category;
  title: string;
  sourceName: string;
  dueDate?: string;
  start: string;
  end: string;
  durationMinutes: number;
  reason: string;
}

export interface WeekPlan {
  startDate: string;
  endDate: string;
  items: WeekPlanItem[];
  totalMinutes: number;
}

interface Candidate {
  entryPath: string;
  category: Category;
  sourceName: string;
  dueDate?: string;
  title: string;
  durationMinutes: number;
  priority: number;
  reason: string;
}

function isValidYmd(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function toYmd(date: Date): string {
  return date.toISOString().split('T')[0];
}

function parseYmdAsUtc(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function startOfWeekMondayUtc(now: Date): Date {
  const day = now.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  return addDays(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())), offset);
}

function parseStartDate(startDate?: string): Date {
  if (startDate) {
    if (!isValidYmd(startDate)) {
      throw new Error('Invalid startDate. Use YYYY-MM-DD');
    }
    return parseYmdAsUtc(startDate);
  }
  return startOfWeekMondayUtc(new Date());
}

function parseDays(days?: number): number {
  const parsed = days ?? 7;
  if (!Number.isFinite(parsed) || parsed < 1 || parsed > 14) {
    throw new Error('Invalid days. Use a number between 1 and 14');
  }
  return Math.floor(parsed);
}

function minutesToTime(minutesFromMidnight: number): { hour: number; minute: number } {
  const hour = Math.floor(minutesFromMidnight / 60);
  const minute = minutesFromMidnight % 60;
  return { hour, minute };
}

function toIsoDateTime(dateYmd: string, hour: number, minute: number): string {
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${dateYmd}T${hh}:${mm}:00.000Z`;
}

function toIcsDateTime(dateYmd: string, hour: number, minute: number): string {
  const compactDate = dateYmd.replace(/-/g, '');
  const hh = String(hour).padStart(2, '0');
  const mm = String(minute).padStart(2, '0');
  return `${compactDate}T${hh}${mm}00`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

export class CalendarService {
  private prisma = getPrismaClient();
  private config = getConfig();

  async buildWeekPlanForUser(userId: string, options?: WeekPlanOptions): Promise<WeekPlan> {
    const start = parseStartDate(options?.startDate);
    const days = parseDays(options?.days);
    const end = addDays(start, days - 1);
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);

    const entries = await this.prisma.entry.findMany({
      where: {
        userId,
        OR: [
          {
            category: 'admin',
            adminDetails: { is: { status: 'pending' } }
          },
          {
            category: 'projects',
            projectDetails: { is: { status: { in: ['active', 'waiting', 'blocked'] } } }
          }
        ]
      },
      include: {
        adminDetails: true,
        projectDetails: true
      }
    });

    const candidates: Candidate[] = entries.map((entry) => {
      if (entry.category === 'admin' && entry.adminDetails) {
        const dueDate = entry.adminDetails.dueDate ? toYmd(entry.adminDetails.dueDate) : undefined;
        const priority = this.computePriority(dueDate, startYmd, endYmd, 'admin');
        return {
          entryPath: `admin/${entry.slug}`,
          category: 'admin',
          sourceName: entry.title,
          title: entry.title,
          dueDate,
          durationMinutes: 45,
          priority,
          reason: dueDate ? `Due on ${dueDate}` : 'Pending admin task'
        };
      }

      const projectDueDate = entry.projectDetails?.dueDate ? toYmd(entry.projectDetails.dueDate) : undefined;
      const nextAction = entry.projectDetails?.nextAction?.trim();
      const priority = this.computePriority(projectDueDate, startYmd, endYmd, 'projects');
      return {
        entryPath: `projects/${entry.slug}`,
        category: 'projects',
        sourceName: entry.title,
        title: nextAction || `Progress ${entry.title}`,
        dueDate: projectDueDate,
        durationMinutes: 90,
        priority,
        reason: projectDueDate ? `Project due on ${projectDueDate}` : 'Active project momentum'
      };
    });

    candidates.sort((a, b) => b.priority - a.priority);

    const dailyCapacity = 4 * 60;
    const dayLoads = Array<number>(days).fill(0);
    const items: WeekPlanItem[] = [];

    for (const candidate of candidates) {
      const dayIndex = this.pickDayIndex(candidate, startYmd, dayLoads, dailyCapacity, days);
      const ymd = toYmd(addDays(start, dayIndex));
      const startMinutes = 9 * 60 + dayLoads[dayIndex];
      const endMinutes = startMinutes + candidate.durationMinutes;
      const startTime = minutesToTime(startMinutes);
      const endTime = minutesToTime(endMinutes);

      items.push({
        entryPath: candidate.entryPath,
        category: candidate.category,
        title: candidate.title,
        sourceName: candidate.sourceName,
        dueDate: candidate.dueDate,
        start: toIsoDateTime(ymd, startTime.hour, startTime.minute),
        end: toIsoDateTime(ymd, endTime.hour, endTime.minute),
        durationMinutes: candidate.durationMinutes,
        reason: candidate.reason
      });

      dayLoads[dayIndex] += candidate.durationMinutes;
    }

    items.sort((a, b) => a.start.localeCompare(b.start));

    return {
      startDate: startYmd,
      endDate: endYmd,
      items,
      totalMinutes: items.reduce((sum, item) => sum + item.durationMinutes, 0)
    };
  }

  createFeedToken(userId: string): { token: string; expiresAt: string } {
    const options: SignOptions = {
      subject: userId,
      expiresIn: '180d'
    };
    const token = jwt.sign(
      { scope: 'calendar_feed' },
      this.config.JWT_SECRET as Secret,
      options
    );
    const decoded = jwt.decode(token) as JwtPayload | null;
    const exp = decoded?.exp ? new Date(decoded.exp * 1000).toISOString() : addDays(new Date(), 180).toISOString();
    return { token, expiresAt: exp };
  }

  verifyFeedToken(token: string): { userId: string } | null {
    try {
      const decoded = jwt.verify(token, this.config.JWT_SECRET as Secret) as JwtPayload;
      const userId = decoded.sub;
      const scope = decoded.scope;
      if (typeof userId !== 'string' || scope !== 'calendar_feed') {
        return null;
      }
      return { userId };
    } catch {
      return null;
    }
  }

  async buildIcsFeedForUser(userId: string, options?: WeekPlanOptions): Promise<string> {
    const plan = await this.buildWeekPlanForUser(userId, options);
    const generatedAt = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Second Brain//Week Plan//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Second Brain Week Plan',
      ...plan.items.flatMap((item, index) => {
        const start = item.start.slice(0, 16);
        const end = item.end.slice(0, 16);
        const dateYmd = start.slice(0, 10);
        const startHour = Number(start.slice(11, 13));
        const startMinute = Number(start.slice(14, 16));
        const endHour = Number(end.slice(11, 13));
        const endMinute = Number(end.slice(14, 16));
        const uid = `${item.entryPath.replace('/', '-')}-${index}@second-brain`;
        return [
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${generatedAt}`,
          `DTSTART:${toIcsDateTime(dateYmd, startHour, startMinute)}`,
          `DTEND:${toIcsDateTime(dateYmd, endHour, endMinute)}`,
          `SUMMARY:${escapeIcsText(item.title)}`,
          `DESCRIPTION:${escapeIcsText(`${item.entryPath} - ${item.reason}`)}`,
          'END:VEVENT'
        ];
      }),
      'END:VCALENDAR'
    ];
    return `${lines.join('\r\n')}\r\n`;
  }

  private computePriority(
    dueDate: string | undefined,
    startYmd: string,
    endYmd: string,
    category: Category
  ): number {
    let score = category === 'admin' ? 120 : 90;
    if (!dueDate) return score;

    if (dueDate < startYmd) return score + 80;
    if (dueDate <= endYmd) {
      const deltaDays =
        (parseYmdAsUtc(dueDate).getTime() - parseYmdAsUtc(startYmd).getTime()) / (24 * 60 * 60 * 1000);
      return score + Math.max(10, 60 - Math.floor(deltaDays) * 8);
    }

    return score + 5;
  }

  private pickDayIndex(
    candidate: Candidate,
    startYmd: string,
    dayLoads: number[],
    dailyCapacity: number,
    days: number
  ): number {
    const dueIndex = candidate.dueDate
      ? Math.floor(
          (parseYmdAsUtc(candidate.dueDate).getTime() - parseYmdAsUtc(startYmd).getTime()) /
            (24 * 60 * 60 * 1000)
        )
      : null;

    if (dueIndex !== null) {
      const boundedDue = Math.max(0, Math.min(days - 1, dueIndex));
      for (let i = 0; i <= boundedDue; i += 1) {
        if (dayLoads[i] + candidate.durationMinutes <= dailyCapacity) {
          return i;
        }
      }
      return boundedDue;
    }

    let bestIndex = 0;
    for (let i = 1; i < dayLoads.length; i += 1) {
      if (dayLoads[i] < dayLoads[bestIndex]) {
        bestIndex = i;
      }
    }
    return bestIndex;
  }
}

let calendarServiceInstance: CalendarService | null = null;

export function getCalendarService(): CalendarService {
  if (!calendarServiceInstance) {
    calendarServiceInstance = new CalendarService();
  }
  return calendarServiceInstance;
}

export function resetCalendarService(): void {
  calendarServiceInstance = null;
}

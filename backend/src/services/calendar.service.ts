import crypto from 'crypto';
import jwt, { Secret, SignOptions, JwtPayload } from 'jsonwebtoken';
import { getPrismaClient } from '../lib/prisma';
import { getConfig } from '../config/env';
import { Category } from '../types/entry.types';
import { isTaskCategory } from '../utils/category';

export interface WeekPlanOptions {
  startDate?: string;
  days?: number;
  granularityMinutes?: number;
  bufferMinutes?: number;
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

export type UnscheduledReasonCode =
  | 'outside_window'
  | 'outside_working_hours'
  | 'fixed_conflict'
  | 'no_free_slot';

export interface WeekPlanUnscheduledItem {
  entryPath: string;
  category: Category;
  title: string;
  sourceName: string;
  dueDate?: string;
  durationMinutes: number;
  reasonCode: UnscheduledReasonCode;
  reason: string;
}

export interface WeekPlan {
  startDate: string;
  endDate: string;
  granularityMinutes: number;
  bufferMinutes: number;
  items: WeekPlanItem[];
  unscheduled: WeekPlanUnscheduledItem[];
  totalMinutes: number;
  warnings: string[];
  generatedAt: string;
  revision: string;
}

export interface CalendarSourceInput {
  name: string;
  url: string;
  color?: string;
}

export interface CalendarSourceUpdateInput {
  name?: string;
  enabled?: boolean;
  color?: string | null;
}

export interface CalendarSourceRecord {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  color: string | null;
  etag: string | null;
  lastSyncAt: string | null;
  fetchStatus: string;
  fetchError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CalendarSyncResult {
  source: CalendarSourceRecord;
  importedBlocks: number;
  totalBlocks: number;
}

export interface CalendarSettingsRecord {
  workdayStartTime: string;
  workdayEndTime: string;
  workingDays: number[];
}

interface Candidate {
  entryPath: string;
  category: Category;
  sourceName: string;
  dueDate?: string;
  dueAt?: Date;
  fixedAt?: Date;
  title: string;
  durationMinutes: number;
  taskPriority: number;
  priority: number;
  reason: string;
}

interface BusyInterval {
  dayIndex: number;
  startMinute: number;
  endMinute: number;
}

interface ParsedBusyEvent {
  blockKey: string;
  externalId?: string;
  title?: string;
  startAt: Date;
  endAt: Date;
  isAllDay: boolean;
}

const DEFAULT_WORKDAY_START_TIME = '09:00';
const DEFAULT_WORKDAY_END_TIME = '17:00';
const DEFAULT_WORKING_DAYS = [1, 2, 3, 4, 5];
const SLOT_GRANULARITY_MINUTES = 15;
const MISSED_TASK_GRACE_MINUTES = 15;
const MIN_SLOT_GRANULARITY_MINUTES = 5;
const MAX_SLOT_GRANULARITY_MINUTES = 60;
const DEFAULT_BUFFER_MINUTES = 0;
const MAX_BUFFER_MINUTES = 120;

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

function parseGranularityMinutes(value?: number): number {
  if (value === undefined) return SLOT_GRANULARITY_MINUTES;
  if (!Number.isFinite(value)) {
    throw new Error(
      `Invalid granularityMinutes. Use an integer between ${MIN_SLOT_GRANULARITY_MINUTES} and ${MAX_SLOT_GRANULARITY_MINUTES}`
    );
  }
  const parsed = Math.floor(value);
  if (parsed < MIN_SLOT_GRANULARITY_MINUTES || parsed > MAX_SLOT_GRANULARITY_MINUTES) {
    throw new Error(
      `Invalid granularityMinutes. Use an integer between ${MIN_SLOT_GRANULARITY_MINUTES} and ${MAX_SLOT_GRANULARITY_MINUTES}`
    );
  }
  return parsed;
}

function parseBufferMinutes(value?: number): number {
  if (value === undefined) return DEFAULT_BUFFER_MINUTES;
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid bufferMinutes. Use an integer between 0 and ${MAX_BUFFER_MINUTES}`);
  }
  const parsed = Math.floor(value);
  if (parsed < 0 || parsed > MAX_BUFFER_MINUTES) {
    throw new Error(`Invalid bufferMinutes. Use an integer between 0 and ${MAX_BUFFER_MINUTES}`);
  }
  return parsed;
}

function parseTimeOfDayToMinutes(value: string, fieldName: string): number {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    throw new Error(`Invalid ${fieldName}. Use HH:mm`);
  }
  const [hoursString, minutesString] = value.split(':');
  const hours = Number(hoursString);
  const minutes = Number(minutesString);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    throw new Error(`Invalid ${fieldName}. Use HH:mm`);
  }
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error(`Invalid ${fieldName}. Use HH:mm`);
  }
  return hours * 60 + minutes;
}

function normalizeWorkingDays(value: number[] | null | undefined): number[] {
  const source = Array.isArray(value) ? value : DEFAULT_WORKING_DAYS;
  const uniqueSorted = Array.from(
    new Set(source.filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))
  ).sort((a, b) => a - b);
  if (uniqueSorted.length === 0) {
    return [...DEFAULT_WORKING_DAYS];
  }
  return uniqueSorted;
}

function alignUpToStep(value: number, step: number): number {
  const remainder = value % step;
  if (remainder === 0) return value;
  return value + (step - remainder);
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

function serializeSource(record: {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  color: string | null;
  etag: string | null;
  lastSyncAt: Date | null;
  fetchStatus: string;
  fetchError: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CalendarSourceRecord {
  return {
    id: record.id,
    name: record.name,
    url: record.url,
    enabled: record.enabled,
    color: record.color,
    etag: record.etag,
    lastSyncAt: record.lastSyncAt?.toISOString() || null,
    fetchStatus: record.fetchStatus,
    fetchError: record.fetchError,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function normalizeIcsLineContinuations(content: string): string[] {
  const rawLines = content.split(/\r?\n/);
  const lines: string[] = [];

  for (const line of rawLines) {
    if (!line) continue;
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }

  return lines;
}

function parseIcsDate(valueWithParams: string): { date: Date | null; isAllDay: boolean } {
  const [rawKey, rawValue = ''] = valueWithParams.split(':');
  const value = rawValue.trim();
  const key = rawKey.toUpperCase();
  const isDateOnly = key.includes('VALUE=DATE') || /^\d{8}$/.test(value);

  if (isDateOnly) {
    if (!/^\d{8}$/.test(value)) return { date: null, isAllDay: true };
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(4, 6)) - 1;
    const day = Number(value.slice(6, 8));
    return { date: new Date(Date.UTC(year, month, day, 0, 0, 0)), isAllDay: true };
  }

  const cleaned = value.endsWith('Z') ? value.slice(0, -1) : value;
  if (!/^\d{8}T\d{6}$/.test(cleaned)) {
    return { date: null, isAllDay: false };
  }

  const year = Number(cleaned.slice(0, 4));
  const month = Number(cleaned.slice(4, 6)) - 1;
  const day = Number(cleaned.slice(6, 8));
  const hour = Number(cleaned.slice(9, 11));
  const minute = Number(cleaned.slice(11, 13));
  const second = Number(cleaned.slice(13, 15));

  return {
    date: new Date(Date.UTC(year, month, day, hour, minute, second)),
    isAllDay: false
  };
}

function parseBusyEventsFromIcs(content: string): ParsedBusyEvent[] {
  const lines = normalizeIcsLineContinuations(content);
  const events: ParsedBusyEvent[] = [];

  let inEvent = false;
  let currentUid: string | undefined;
  let currentSummary: string | undefined;
  let dtStartLine: string | undefined;
  let dtEndLine: string | undefined;

  const flush = () => {
    if (!dtStartLine) return;
    const parsedStart = parseIcsDate(dtStartLine);
    if (!parsedStart.date) return;

    let parsedEnd = dtEndLine ? parseIcsDate(dtEndLine) : { date: null, isAllDay: parsedStart.isAllDay };
    if (!parsedEnd.date) {
      const defaultMinutes = parsedStart.isAllDay ? 24 * 60 : 60;
      parsedEnd = {
        date: new Date(parsedStart.date.getTime() + defaultMinutes * 60 * 1000),
        isAllDay: parsedStart.isAllDay
      };
    }
    const endDate = parsedEnd.date;
    if (!endDate) return;

    if (endDate <= parsedStart.date) return;

    const keySource = `${currentUid || ''}|${parsedStart.date.toISOString()}|${endDate.toISOString()}|${currentSummary || ''}`;
    const blockKey = crypto.createHash('sha1').update(keySource).digest('hex');

    events.push({
      blockKey,
      externalId: currentUid,
      title: currentSummary,
      startAt: parsedStart.date,
      endAt: endDate,
      isAllDay: parsedStart.isAllDay
    });
  };

  for (const line of lines) {
    const upper = line.toUpperCase();

    if (upper === 'BEGIN:VEVENT') {
      inEvent = true;
      currentUid = undefined;
      currentSummary = undefined;
      dtStartLine = undefined;
      dtEndLine = undefined;
      continue;
    }

    if (upper === 'END:VEVENT') {
      flush();
      inEvent = false;
      continue;
    }

    if (!inEvent) continue;

    if (upper.startsWith('UID:')) {
      currentUid = line.slice(line.indexOf(':') + 1).trim();
      continue;
    }

    if (upper.startsWith('SUMMARY:')) {
      currentSummary = line.slice(line.indexOf(':') + 1).trim();
      continue;
    }

    if (upper.startsWith('DTSTART')) {
      dtStartLine = line;
      continue;
    }

    if (upper.startsWith('DTEND')) {
      dtEndLine = line;
    }
  }

  return events;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export class CalendarService {
  private prisma = getPrismaClient();
  private config = getConfig();

  async getSettingsForUser(userId: string): Promise<CalendarSettingsRecord> {
    const settings = await this.ensureSettingsForUser(userId);
    return this.serializeSettings(settings);
  }

  async updateSettingsForUser(
    userId: string,
    updates: Partial<CalendarSettingsRecord>
  ): Promise<CalendarSettingsRecord> {
    const existing = await this.ensureSettingsForUser(userId);
    const nextStart = updates.workdayStartTime ?? existing.workdayStartTime;
    const nextEnd = updates.workdayEndTime ?? existing.workdayEndTime;
    const nextDays = updates.workingDays ?? existing.workingDays;
    const startMinutes = parseTimeOfDayToMinutes(nextStart, 'workdayStartTime');
    const endMinutes = parseTimeOfDayToMinutes(nextEnd, 'workdayEndTime');
    if (endMinutes <= startMinutes) {
      throw new Error('workdayEndTime must be later than workdayStartTime');
    }

    const normalizedDays = normalizeWorkingDays(nextDays);
    const updated = await this.prisma.calendarSettings.update({
      where: { id: existing.id },
      data: {
        workdayStartTime: nextStart,
        workdayEndTime: nextEnd,
        workingDays: normalizedDays
      }
    });
    return this.serializeSettings(updated);
  }

  async listSourcesForUser(userId: string): Promise<CalendarSourceRecord[]> {
    const sources = await this.prisma.calendarSource.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' }
    });
    return sources.map(serializeSource);
  }

  async buildReplanForUser(userId: string, options?: WeekPlanOptions): Promise<WeekPlan> {
    return this.buildWeekPlanForUser(userId, options);
  }

  async createSourceForUser(userId: string, input: CalendarSourceInput): Promise<CalendarSourceRecord> {
    const name = input.name?.trim();
    const url = input.url?.trim();
    const color = input.color?.trim() || null;

    if (!name) {
      throw new Error('Source name is required');
    }
    this.validateSourceUrl(url);

    const created = await this.prisma.calendarSource.create({
      data: {
        userId,
        name,
        url,
        color
      }
    });

    return serializeSource(created);
  }

  async updateSourceForUser(userId: string, sourceId: string, input: CalendarSourceUpdateInput): Promise<CalendarSourceRecord> {
    const existing = await this.prisma.calendarSource.findFirst({ where: { id: sourceId, userId } });
    if (!existing) {
      throw new Error('Calendar source not found');
    }

    const updated = await this.prisma.calendarSource.update({
      where: { id: sourceId },
      data: {
        name: input.name?.trim(),
        enabled: input.enabled,
        color: input.color === undefined ? undefined : (input.color?.trim() || null)
      }
    });

    return serializeSource(updated);
  }

  async deleteSourceForUser(userId: string, sourceId: string): Promise<void> {
    const existing = await this.prisma.calendarSource.findFirst({ where: { id: sourceId, userId } });
    if (!existing) {
      throw new Error('Calendar source not found');
    }

    await this.prisma.calendarSource.delete({ where: { id: sourceId } });
  }

  async syncSourceForUser(userId: string, sourceId: string): Promise<CalendarSyncResult> {
    const source = await this.prisma.calendarSource.findFirst({ where: { id: sourceId, userId } });
    if (!source) {
      throw new Error('Calendar source not found');
    }

    this.validateSourceUrl(source.url);

    const headers: Record<string, string> = {};
    if (source.etag) {
      headers['If-None-Match'] = source.etag;
    }

    let response: Response;
    try {
      response = await fetch(source.url, { headers });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to fetch calendar source';
      await this.prisma.calendarSource.update({
        where: { id: source.id },
        data: {
          lastSyncAt: new Date(),
          fetchStatus: 'fetch_failed',
          fetchError: message
        }
      });
      throw new Error(`Failed to fetch calendar source: ${message}`);
    }

    if (response.status === 304) {
      const unchanged = await this.prisma.calendarSource.update({
        where: { id: source.id },
        data: {
          lastSyncAt: new Date(),
          fetchStatus: 'synced',
          fetchError: null
        },
        include: {
          busyBlocks: true
        }
      });

      return {
        source: serializeSource(unchanged),
        importedBlocks: 0,
        totalBlocks: unchanged.busyBlocks.length
      };
    }

    if (!response.ok) {
      const message = `Source returned HTTP ${response.status}`;
      await this.prisma.calendarSource.update({
        where: { id: source.id },
        data: {
          lastSyncAt: new Date(),
          fetchStatus: 'fetch_failed',
          fetchError: message
        }
      });
      throw new Error(message);
    }

    const body = await response.text();
    const parsedEvents = parseBusyEventsFromIcs(body);

    const etag = response.headers.get('etag');

    const synced = await this.prisma.$transaction(async (tx) => {
      await tx.calendarBusyBlock.deleteMany({ where: { sourceId: source.id } });

      if (parsedEvents.length > 0) {
        await tx.calendarBusyBlock.createMany({
          data: parsedEvents.map((event) => ({
            userId,
            sourceId: source.id,
            blockKey: event.blockKey,
            externalId: event.externalId,
            title: event.title,
            startAt: event.startAt,
            endAt: event.endAt,
            isAllDay: event.isAllDay
          }))
        });
      }

      return tx.calendarSource.update({
        where: { id: source.id },
        data: {
          etag,
          lastSyncAt: new Date(),
          fetchStatus: 'synced',
          fetchError: null
        },
        include: {
          busyBlocks: true
        }
      });
    });

    return {
      source: serializeSource(synced),
      importedBlocks: parsedEvents.length,
      totalBlocks: synced.busyBlocks.length
    };
  }

  async buildWeekPlanForUser(userId: string, options?: WeekPlanOptions): Promise<WeekPlan> {
    const start = parseStartDate(options?.startDate);
    const days = parseDays(options?.days);
    const granularityMinutes = parseGranularityMinutes(options?.granularityMinutes);
    const bufferMinutes = parseBufferMinutes(options?.bufferMinutes);
    const enforceCurrentTime = !options?.startDate;
    const now = new Date();
    const nowYmd = toYmd(now);
    const nowMinute = now.getUTCHours() * 60 + now.getUTCMinutes();
    const todayIndex = enforceCurrentTime
      ? Math.floor((parseYmdAsUtc(nowYmd).getTime() - start.getTime()) / (24 * 60 * 60 * 1000))
      : -1;
    const end = addDays(start, days - 1);
    const windowEndExclusive = addDays(end, 1);
    const startYmd = toYmd(start);
    const endYmd = toYmd(end);
    const settings = await this.ensureSettingsForUser(userId);
    const workdayStartMinutes = parseTimeOfDayToMinutes(settings.workdayStartTime, 'workdayStartTime');
    const workdayEndMinutes = parseTimeOfDayToMinutes(settings.workdayEndTime, 'workdayEndTime');
    const workingDays = normalizeWorkingDays(settings.workingDays);

    const entries = await this.prisma.entry.findMany({
      where: {
        userId,
        OR: [
          {
            category: { in: ['task', 'admin'] as any },
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
      if (isTaskCategory(entry.category) && entry.adminDetails) {
        const dueAt = entry.adminDetails.dueDate ?? undefined;
        const dueDate = dueAt ? toYmd(dueAt) : undefined;
        const fixedAt = entry.adminDetails.fixedAt ?? undefined;
        const taskPriority = entry.adminDetails.priority ?? 3;
        const priority = this.computePriority(dueAt, startYmd, endYmd, 'task', taskPriority);
        return {
          entryPath: `task/${entry.slug}`,
          category: 'task',
          sourceName: entry.title,
          title: entry.title,
          dueDate,
          dueAt,
          fixedAt,
          durationMinutes: Math.max(5, entry.adminDetails.durationMinutes || 30),
          taskPriority,
          priority,
          reason: fixedAt
            ? `Fixed at ${fixedAt.toISOString()}`
            : dueAt
              ? `Due at ${dueAt.toISOString()}`
              : 'Pending task'
        };
      }

      const projectDueDate = entry.projectDetails?.dueDate ? toYmd(entry.projectDetails.dueDate) : undefined;
      const projectDueAt = entry.projectDetails?.dueDate ?? undefined;
      const nextAction = entry.projectDetails?.nextAction?.trim();
      const priority = this.computePriority(projectDueAt, startYmd, endYmd, 'projects');
      return {
        entryPath: `projects/${entry.slug}`,
        category: 'projects',
        sourceName: entry.title,
        title: nextAction || `Progress ${entry.title}`,
        dueDate: projectDueDate,
        dueAt: projectDueAt,
        durationMinutes: 90,
        taskPriority: 3,
        priority,
        reason: projectDueDate ? `Project due on ${projectDueDate}` : 'Active project momentum'
      };
    });

    candidates.sort((a, b) => b.priority - a.priority);

    const busyBlocks = await this.prisma.calendarBusyBlock.findMany({
      where: {
        userId,
        source: { enabled: true },
        startAt: { lt: windowEndExclusive },
        endAt: { gt: start }
      },
      orderBy: { startAt: 'asc' }
    });

    const dayLoads = Array<number>(days).fill(0);
    const dayIntervals = Array.from({ length: days }, () => [] as Array<{ startMinute: number; endMinute: number }>);
    const warnings: string[] = [];
    const unscheduled: WeekPlanUnscheduledItem[] = [];

    for (const block of busyBlocks) {
      const intervals = this.toBusyIntervalsForWindow(
        block.startAt,
        block.endAt,
        start,
        days,
        bufferMinutes,
        workdayStartMinutes,
        workdayEndMinutes,
        workingDays
      );
      for (const interval of intervals) {
        dayIntervals[interval.dayIndex].push({
          startMinute: interval.startMinute,
          endMinute: interval.endMinute
        });
      }
    }

    for (const intervals of dayIntervals) {
      intervals.sort((a, b) => a.startMinute - b.startMinute);
    }

    const items: WeekPlanItem[] = [];
    const missedFixedCandidates: Candidate[] = [];
    const fixedCandidates = candidates.filter((candidate) => Boolean(candidate.fixedAt));
    const flexibleCandidates = candidates.filter((candidate) => !candidate.fixedAt);

    for (const candidate of fixedCandidates) {
      const fixedAt = candidate.fixedAt as Date;
      const dayIndex = Math.floor((Date.UTC(
        fixedAt.getUTCFullYear(),
        fixedAt.getUTCMonth(),
        fixedAt.getUTCDate()
      ) - start.getTime()) / (24 * 60 * 60 * 1000));

      if (dayIndex < 0 || dayIndex >= days) {
        this.pushUnscheduled(
          unscheduled,
          warnings,
          candidate,
          'outside_window',
          `Skipped ${candidate.sourceName}: fixed appointment is outside planning window`
        );
        continue;
      }

      const candidateDate = addDays(start, dayIndex);
      if (!this.isWorkingDay(candidateDate, workingDays)) {
        this.pushUnscheduled(
          unscheduled,
          warnings,
          candidate,
          'outside_working_hours',
          `Skipped ${candidate.sourceName}: fixed appointment is on a non-working day`
        );
        continue;
      }

      const startMinute = fixedAt.getUTCHours() * 60 + fixedAt.getUTCMinutes();
      const endMinute = startMinute + candidate.durationMinutes;
      if (
        enforceCurrentTime &&
        (dayIndex < todayIndex || (dayIndex === todayIndex && endMinute + MISSED_TASK_GRACE_MINUTES <= nowMinute))
      ) {
        missedFixedCandidates.push({
          ...candidate,
          fixedAt: undefined,
          reason: `Rescheduled after missed fixed slot (${candidate.reason})`
        });
        continue;
      }
      if (startMinute < workdayStartMinutes || endMinute > workdayEndMinutes) {
        this.pushUnscheduled(
          unscheduled,
          warnings,
          candidate,
          'outside_working_hours',
          `Skipped ${candidate.sourceName}: fixed appointment is outside working hours`
        );
        continue;
      }

      const blocked = dayIntervals[dayIndex].some((interval) =>
        overlaps(startMinute, endMinute, interval.startMinute, interval.endMinute)
      );
      if (blocked) {
        this.pushUnscheduled(
          unscheduled,
          warnings,
          candidate,
          'fixed_conflict',
          `Skipped ${candidate.sourceName}: fixed appointment conflicts with busy blocks`
        );
        continue;
      }

      dayIntervals[dayIndex].push({ startMinute, endMinute });
      dayIntervals[dayIndex].sort((a, b) => a.startMinute - b.startMinute);
      dayLoads[dayIndex] += candidate.durationMinutes;

      const ymd = toYmd(addDays(start, dayIndex));
      const startTime = minutesToTime(startMinute);
      const endTime = minutesToTime(endMinute);
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
    }

    const allFlexibleCandidates = [...flexibleCandidates, ...missedFixedCandidates];
    allFlexibleCandidates.sort((a, b) => b.priority - a.priority);
    const minimumDayIndex = enforceCurrentTime ? Math.max(0, Math.min(days, todayIndex)) : 0;

    for (const candidate of allFlexibleCandidates) {
      const dayOrder = this.getCandidateDayOrder(
        candidate,
        startYmd,
        start,
        days,
        dayLoads,
        workingDays,
        minimumDayIndex
      );
      let scheduled = false;

      if (dayOrder.length === 0) {
        this.pushUnscheduled(
          unscheduled,
          warnings,
          candidate,
          'outside_working_hours',
          `Skipped ${candidate.sourceName}: no working-day window in planning range`
        );
        continue;
      }

      for (const dayIndex of dayOrder) {
        const latestEndMinute = this.getLatestEndMinuteForDay(candidate, start, dayIndex, workdayEndMinutes);
        const minimumStartMinute =
          enforceCurrentTime && dayIndex === todayIndex
            ? Math.min(
                workdayEndMinutes,
                Math.max(
                  workdayStartMinutes,
                  alignUpToStep(nowMinute + MISSED_TASK_GRACE_MINUTES, granularityMinutes)
                )
              )
            : workdayStartMinutes;
        const slotStart = this.findFirstAvailableSlot(
          dayIntervals[dayIndex],
          candidate.durationMinutes,
          latestEndMinute,
          granularityMinutes,
          minimumStartMinute,
          workdayStartMinutes
        );
        if (slotStart === null) continue;

        const slotEnd = slotStart + candidate.durationMinutes;
        dayIntervals[dayIndex].push({ startMinute: slotStart, endMinute: slotEnd });
        dayIntervals[dayIndex].sort((a, b) => a.startMinute - b.startMinute);
        dayLoads[dayIndex] += candidate.durationMinutes;

        const ymd = toYmd(addDays(start, dayIndex));
        const startTime = minutesToTime(slotStart);
        const endTime = minutesToTime(slotEnd);

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

        scheduled = true;
        break;
      }

      if (!scheduled) {
        this.pushUnscheduled(
          unscheduled,
          warnings,
          candidate,
          'no_free_slot',
          `Skipped ${candidate.sourceName}: no free slot in planning window`
        );
      }
    }

    items.sort((a, b) => a.start.localeCompare(b.start));
    const generatedAt = new Date().toISOString();
    const revision = this.computePlanRevision(startYmd, endYmd, items, unscheduled, granularityMinutes, bufferMinutes);

    return {
      startDate: startYmd,
      endDate: endYmd,
      granularityMinutes,
      bufferMinutes,
      items,
      unscheduled,
      totalMinutes: items.reduce((sum, item) => sum + item.durationMinutes, 0),
      warnings,
      generatedAt,
      revision
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

  async buildIcsFeedForUser(
    userId: string,
    options?: WeekPlanOptions
  ): Promise<{ ics: string; generatedAt: string; revision: string }> {
    const plan = await this.buildWeekPlanForUser(userId, options);
    const generatedAt = plan.generatedAt.replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
    const sequence = Number.parseInt(plan.revision.slice(0, 8), 16);
    const lines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Second Brain//Week Plan//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:Second Brain Week Plan',
      'REFRESH-INTERVAL;VALUE=DURATION:PT5M',
      'X-PUBLISHED-TTL:PT5M',
      ...plan.items.flatMap((item) => {
        const start = item.start.slice(0, 16);
        const end = item.end.slice(0, 16);
        const dateYmd = start.slice(0, 10);
        const startHour = Number(start.slice(11, 13));
        const startMinute = Number(start.slice(14, 16));
        const endHour = Number(end.slice(11, 13));
        const endMinute = Number(end.slice(14, 16));
        const uid = `${crypto.createHash('sha1').update(item.entryPath).digest('hex').slice(0, 16)}@second-brain`;
        return [
          'BEGIN:VEVENT',
          `UID:${uid}`,
          `DTSTAMP:${generatedAt}`,
          `LAST-MODIFIED:${generatedAt}`,
          `SEQUENCE:${sequence}`,
          `DTSTART:${toIcsDateTime(dateYmd, startHour, startMinute)}`,
          `DTEND:${toIcsDateTime(dateYmd, endHour, endMinute)}`,
          `SUMMARY:${escapeIcsText(item.title)}`,
          `DESCRIPTION:${escapeIcsText(`${item.entryPath} - ${item.reason}`)}`,
          'END:VEVENT'
        ];
      }),
      'END:VCALENDAR'
    ];
    return {
      ics: `${lines.join('\r\n')}\r\n`,
      generatedAt: plan.generatedAt,
      revision: plan.revision
    };
  }

  private validateSourceUrl(url: string | undefined): asserts url is string {
    if (!url) {
      throw new Error('Source URL is required');
    }
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('Invalid source URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Source URL must use http or https');
    }
  }

  private computePriority(
    dueAt: Date | undefined,
    startYmd: string,
    endYmd: string,
    category: Category,
    taskPriority = 3
  ): number {
    let score = isTaskCategory(category) ? 120 + (Math.max(1, Math.min(5, taskPriority)) - 3) * 25 : 90;
    if (!dueAt) return score;

    const dueDate = toYmd(dueAt);

    if (dueDate < startYmd) return score + 80;
    if (dueDate <= endYmd) {
      const deltaDays =
        (parseYmdAsUtc(dueDate).getTime() - parseYmdAsUtc(startYmd).getTime()) / (24 * 60 * 60 * 1000);
      let boost = Math.max(10, 60 - Math.floor(deltaDays) * 8);
      if (isTaskCategory(category) && deltaDays === 0) {
        const dueMinutes = dueAt.getUTCHours() * 60 + dueAt.getUTCMinutes();
        if (dueMinutes <= 12 * 60) {
          boost += 8;
        }
      }
      return score + boost;
    }

    return score + 5;
  }

  private toBusyIntervalsForWindow(
    startAt: Date,
    endAt: Date,
    windowStart: Date,
    days: number,
    bufferMinutes: number,
    workdayStartMinutes: number,
    workdayEndMinutes: number,
    workingDays: number[]
  ): BusyInterval[] {
    const intervals: BusyInterval[] = [];
    const expandedStart = new Date(startAt.getTime() - bufferMinutes * 60 * 1000);
    const expandedEnd = new Date(endAt.getTime() + bufferMinutes * 60 * 1000);

    for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
      const dayStart = addDays(windowStart, dayIndex);
      const dayEnd = addDays(dayStart, 1);
      if (!this.isWorkingDay(dayStart, workingDays)) {
        continue;
      }
      if (!overlaps(expandedStart.getTime(), expandedEnd.getTime(), dayStart.getTime(), dayEnd.getTime())) {
        continue;
      }

      const clampedStart = Math.max(expandedStart.getTime(), dayStart.getTime());
      const clampedEnd = Math.min(expandedEnd.getTime(), dayEnd.getTime());

      const startDate = new Date(clampedStart);
      const endDate = new Date(clampedEnd);
      const startMinute = startDate.getUTCHours() * 60 + startDate.getUTCMinutes();
      const endMinute = endDate.getUTCHours() * 60 + endDate.getUTCMinutes();

      const boundedStart = Math.max(workdayStartMinutes, startMinute);
      const boundedEnd = Math.min(workdayEndMinutes, endMinute);
      if (boundedEnd <= boundedStart) {
        continue;
      }

      intervals.push({
        dayIndex,
        startMinute: boundedStart,
        endMinute: boundedEnd
      });
    }

    return intervals;
  }

  private getCandidateDayOrder(
    candidate: Candidate,
    startYmd: string,
    windowStart: Date,
    days: number,
    dayLoads: number[],
    workingDays: number[],
    minimumDayIndex = 0
  ): number[] {
    if (minimumDayIndex >= days) {
      return [];
    }
    const dueAnchorDate = candidate.dueAt ? toYmd(candidate.dueAt) : candidate.dueDate;
    const dueIndex = dueAnchorDate
      ? Math.floor(
          (parseYmdAsUtc(dueAnchorDate).getTime() - parseYmdAsUtc(startYmd).getTime()) /
            (24 * 60 * 60 * 1000)
        )
      : null;

    if (dueIndex !== null) {
      const boundedDue = Math.max(0, Math.min(days - 1, dueIndex));
      if (boundedDue < minimumDayIndex) {
        return Array.from({ length: days - minimumDayIndex }, (_, i) => i + minimumDayIndex).filter((dayIndex) =>
          this.isWorkingDay(addDays(windowStart, dayIndex), workingDays)
        );
      }
      return Array.from({ length: boundedDue - minimumDayIndex + 1 }, (_, i) => i + minimumDayIndex).filter((dayIndex) =>
        this.isWorkingDay(addDays(windowStart, dayIndex), workingDays)
      );
    }

    return Array.from({ length: days - minimumDayIndex }, (_, i) => i + minimumDayIndex).sort((a, b) => {
      if (dayLoads[a] === dayLoads[b]) {
        return a - b;
      }
      return dayLoads[a] - dayLoads[b];
    }).filter((dayIndex) => this.isWorkingDay(addDays(windowStart, dayIndex), workingDays));
  }

  private findFirstAvailableSlot(
    intervals: Array<{ startMinute: number; endMinute: number }>,
    durationMinutes: number,
    latestEndMinute: number,
    granularityMinutes = SLOT_GRANULARITY_MINUTES,
    minimumStartMinute: number,
    workdayStartMinutes: number
  ): number | null {
    const startMinute = Math.max(workdayStartMinutes, minimumStartMinute);
    for (
      let cursor = startMinute;
      cursor + durationMinutes <= latestEndMinute;
      cursor += granularityMinutes
    ) {
      const slotEnd = cursor + durationMinutes;
      const blocked = intervals.some((interval) => overlaps(cursor, slotEnd, interval.startMinute, interval.endMinute));
      if (!blocked) {
        return cursor;
      }
    }
    return null;
  }

  private getLatestEndMinuteForDay(
    candidate: Candidate,
    windowStart: Date,
    dayIndex: number,
    workdayEndMinutes: number
  ): number {
    if (!candidate.dueAt) {
      return workdayEndMinutes;
    }
    const dueAt = candidate.dueAt;
    const dueAtMinute = dueAt.getUTCHours() * 60 + dueAt.getUTCMinutes();
    // Date-only due dates are stored at midnight; do not treat them as same-day hard time cutoffs.
    if (dueAtMinute === 0) {
      return workdayEndMinutes;
    }
    const dueYmd = toYmd(dueAt);
    const candidateDay = toYmd(addDays(windowStart, dayIndex));
    if (candidateDay !== dueYmd) {
      return workdayEndMinutes;
    }
    return Math.min(workdayEndMinutes, dueAtMinute);
  }

  private isWorkingDay(date: Date, workingDays: number[]): boolean {
    const day = date.getUTCDay();
    return workingDays.includes(day);
  }

  private pushUnscheduled(
    unscheduled: WeekPlanUnscheduledItem[],
    warnings: string[],
    candidate: Candidate,
    reasonCode: UnscheduledReasonCode,
    reason: string
  ): void {
    unscheduled.push({
      entryPath: candidate.entryPath,
      category: candidate.category,
      title: candidate.title,
      sourceName: candidate.sourceName,
      dueDate: candidate.dueDate,
      durationMinutes: candidate.durationMinutes,
      reasonCode,
      reason
    });
    warnings.push(reason);
  }

  private serializeSettings(settings: {
    workdayStartTime: string;
    workdayEndTime: string;
    workingDays: number[] | null;
  }): CalendarSettingsRecord {
    return {
      workdayStartTime: settings.workdayStartTime,
      workdayEndTime: settings.workdayEndTime,
      workingDays: normalizeWorkingDays(settings.workingDays)
    };
  }

  private async ensureSettingsForUser(userId: string): Promise<{
    id: string;
    workdayStartTime: string;
    workdayEndTime: string;
    workingDays: number[] | null;
  }> {
    const existing = await this.prisma.calendarSettings.findUnique({
      where: { userId }
    });
    if (existing) {
      return existing;
    }
    return this.prisma.calendarSettings.create({
      data: {
        userId,
        workdayStartTime: DEFAULT_WORKDAY_START_TIME,
        workdayEndTime: DEFAULT_WORKDAY_END_TIME,
        workingDays: [...DEFAULT_WORKING_DAYS]
      }
    });
  }

  private computePlanRevision(
    startDate: string,
    endDate: string,
    items: WeekPlanItem[],
    unscheduled: WeekPlanUnscheduledItem[],
    granularityMinutes: number,
    bufferMinutes: number
  ): string {
    const payload = JSON.stringify({
      startDate,
      endDate,
      granularityMinutes,
      bufferMinutes,
      items,
      unscheduled
    });
    return crypto.createHash('sha1').update(payload).digest('hex').slice(0, 16);
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

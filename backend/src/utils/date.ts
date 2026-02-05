import { getConfig } from '../config/env';

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_MAP: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function resolveTimeZone(timeZone?: string): string {
  const tz = timeZone || 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz }).format(new Date());
    return tz;
  } catch {
    console.warn(`Invalid TIMEZONE "${tz}", falling back to UTC`);
    return 'UTC';
  }
}

function getDateParts(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.year),
    month: Number(lookup.month),
    day: Number(lookup.day),
  };
}

function formatDateParts(parts: { year: number; month: number; day: number }): string {
  const month = String(parts.month).padStart(2, '0');
  const day = String(parts.day).padStart(2, '0');
  return `${parts.year}-${month}-${day}`;
}

function dateFromParts(parts: { year: number; month: number; day: number }): Date {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function addMonths(parts: { year: number; month: number; day: number }, monthsToAdd: number) {
  const rawMonth = parts.month - 1 + monthsToAdd;
  const targetYear = parts.year + Math.floor(rawMonth / 12);
  const targetMonth = (rawMonth % 12 + 12) % 12;
  const daysInMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const day = Math.min(parts.day, daysInMonth);
  return { year: targetYear, month: targetMonth + 1, day };
}

function parseIsoDate(dateStr: string): string | undefined {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return undefined;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return formatDateParts({ year, month, day });
}

function resolveRelativeDate(
  text: string,
  today: Date,
  timeZone: string
): string | undefined {
  const normalized = text.toLowerCase();
  const todayParts = getDateParts(today, timeZone);
  const todayDate = dateFromParts(todayParts);

  if (normalized.includes('tomorrow')) {
    return formatDateParts(getDateParts(addDays(todayDate, 1), timeZone));
  }
  if (
    normalized.includes('today') ||
    normalized.includes('tonight') ||
    normalized.includes('this morning') ||
    normalized.includes('this afternoon') ||
    normalized.includes('this evening')
  ) {
    return formatDateParts(todayParts);
  }
  if (normalized.includes('yesterday')) {
    return formatDateParts(getDateParts(addDays(todayDate, -1), timeZone));
  }
  if (normalized.includes('next week')) {
    return formatDateParts(getDateParts(addDays(todayDate, 7), timeZone));
  }
  if (normalized.includes('next month')) {
    return formatDateParts(addMonths(todayParts, 1));
  }
  if (normalized.includes('next year')) {
    return formatDateParts({ ...todayParts, year: todayParts.year + 1 });
  }

  const weekdayMatch = normalized.match(/\b(?:next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/);
  if (weekdayMatch) {
    const target = WEEKDAY_MAP[weekdayMatch[1]];
    const current = todayDate.getUTCDay();
    let delta = (target - current + 7) % 7;
    if (delta === 0) delta = 7;
    return formatDateParts(getDateParts(addDays(todayDate, delta), timeZone));
  }

  return undefined;
}

export function getCurrentDateString(timeZone?: string, now?: Date): string {
  const tz = resolveTimeZone(timeZone || getConfig().TIMEZONE);
  const base = now || new Date();
  return formatDateParts(getDateParts(base, tz));
}

export function normalizeDueDate(
  dueDate: string | undefined,
  sourceText?: string,
  options?: { now?: Date; timeZone?: string }
): string | undefined {
  const tz = resolveTimeZone(options?.timeZone || getConfig().TIMEZONE);
  const now = options?.now || new Date();
  const text = sourceText || dueDate || '';

  const relative = resolveRelativeDate(text, now, tz);
  if (relative) {
    return relative;
  }

  if (!dueDate) return undefined;
  return parseIsoDate(dueDate);
}

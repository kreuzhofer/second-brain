/**
 * Pure helper functions for the CalendarBoardView component.
 */

/** Parse "HH:mm" string to total minutes from midnight. */
export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Compute minute-of-day offset from workday start for a UTC ISO datetime.
 * Returns negative if before workday start, or > workday length if after.
 */
export function timeToMinuteOffset(isoDatetime: string, workdayStartMinutes: number): number {
  const date = new Date(isoDatetime);
  const minuteOfDay = date.getUTCHours() * 60 + date.getUTCMinutes();
  return minuteOfDay - workdayStartMinutes;
}

/**
 * Determine which day-column index (0-based) a datetime falls in,
 * relative to the plan start date (YYYY-MM-DD).
 */
export function dayIndexFromPlanStart(isoDatetime: string, planStartDate: string): number {
  const blockDate = isoDatetime.slice(0, 10);
  const start = new Date(`${planStartDate}T00:00:00Z`).getTime();
  const block = new Date(`${blockDate}T00:00:00Z`).getTime();
  return Math.floor((block - start) / 86_400_000);
}

/**
 * Generate time labels for the left gutter.
 * Returns labels from startMinutes up to (but not including) endMinutes,
 * at the given step interval.
 */
export function generateTimeLabels(
  startMinutes: number,
  endMinutes: number,
  stepMinutes: number
): Array<{ label: string; offsetMinutes: number }> {
  const labels: Array<{ label: string; offsetMinutes: number }> = [];
  for (let m = startMinutes; m < endMinutes; m += stepMinutes) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const label = `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    labels.push({ label, offsetMinutes: m - startMinutes });
  }
  return labels;
}

/**
 * Clamp a block's minute range to the workday window.
 * Returns null if the block falls entirely outside the workday.
 */
export function clampBlockToWorkday(
  startMinute: number,
  endMinute: number,
  workdayStart: number,
  workdayEnd: number
): { startMinute: number; endMinute: number } | null {
  const clamped = {
    startMinute: Math.max(startMinute, workdayStart),
    endMinute: Math.min(endMinute, workdayEnd)
  };
  if (clamped.endMinute <= clamped.startMinute) return null;
  return clamped;
}

/**
 * Format a short day header label from a YYYY-MM-DD date string.
 * Returns e.g. "Mon 10" or "Tue 11".
 */
export function formatDayHeader(dateYmd: string): string {
  const date = new Date(`${dateYmd}T12:00:00Z`);
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = dayNames[date.getUTCDay()];
  return `${day} ${date.getUTCDate()}`;
}

/**
 * Get the YYYY-MM-DD string for planStartDate + dayOffset days.
 */
export function addDaysToYmd(startDate: string, dayOffset: number): string {
  const date = new Date(`${startDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

/**
 * Use a stable high-contrast text palette for translucent busy blocks.
 * Busy block backgrounds are rendered with low opacity, so dark text is readable
 * across all source colors. Pass isDark for dark-mode-appropriate light text.
 */
export function getBusyBlockTextStyle(isDark?: boolean): { titleColor: string; locationColor: string } {
  if (isDark) {
    return {
      titleColor: '#cbd5e1',   // slate-300
      locationColor: '#94a3b8'  // slate-400
    };
  }
  return {
    titleColor: '#334155',   // slate-700
    locationColor: '#475569'  // slate-600
  };
}

/** Convert a hex color to rgba() with alpha; fall back to slate when invalid. */
export function withAlpha(color: string, alpha: number): string {
  const hex = color.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    const r = Number.parseInt(hex.slice(1, 3), 16);
    const g = Number.parseInt(hex.slice(3, 5), 16);
    const b = Number.parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const r = Number.parseInt(`${hex[1]}${hex[1]}`, 16);
    const g = Number.parseInt(`${hex[2]}${hex[2]}`, 16);
    const b = Number.parseInt(`${hex[3]}${hex[3]}`, 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return `rgba(148, 163, 184, ${alpha})`;
}

import { describe, it, expect } from 'vitest';
import {
  parseTimeToMinutes,
  timeToMinuteOffset,
  dayIndexFromPlanStart,
  generateTimeLabels,
  clampBlockToWorkday,
  formatDayHeader,
  addDaysToYmd,
  getBusyBlockTextStyle,
  withAlpha
} from './calendar-board-helpers';

describe('calendar-board-helpers', () => {
  describe('parseTimeToMinutes', () => {
    it('parses 09:00 as 540', () => {
      expect(parseTimeToMinutes('09:00')).toBe(540);
    });
    it('parses 17:30 as 1050', () => {
      expect(parseTimeToMinutes('17:30')).toBe(1050);
    });
    it('parses 00:00 as 0', () => {
      expect(parseTimeToMinutes('00:00')).toBe(0);
    });
  });

  describe('timeToMinuteOffset', () => {
    it('returns 0 when event starts at workday start', () => {
      expect(timeToMinuteOffset('2026-02-10T09:00:00.000Z', 540)).toBe(0);
    });
    it('returns positive offset for event after workday start', () => {
      expect(timeToMinuteOffset('2026-02-10T10:30:00.000Z', 540)).toBe(90);
    });
    it('returns negative offset for event before workday start', () => {
      expect(timeToMinuteOffset('2026-02-10T08:00:00.000Z', 540)).toBe(-60);
    });
  });

  describe('dayIndexFromPlanStart', () => {
    it('returns 0 for same day', () => {
      expect(dayIndexFromPlanStart('2026-02-10T09:00:00.000Z', '2026-02-10')).toBe(0);
    });
    it('returns 2 for two days later', () => {
      expect(dayIndexFromPlanStart('2026-02-12T14:00:00.000Z', '2026-02-10')).toBe(2);
    });
    it('returns negative for dates before start', () => {
      expect(dayIndexFromPlanStart('2026-02-08T09:00:00.000Z', '2026-02-10')).toBe(-2);
    });
  });

  describe('generateTimeLabels', () => {
    it('generates hourly labels for 09:00 to 12:00', () => {
      const labels = generateTimeLabels(540, 720, 60);
      expect(labels).toEqual([
        { label: '09:00', offsetMinutes: 0 },
        { label: '10:00', offsetMinutes: 60 },
        { label: '11:00', offsetMinutes: 120 }
      ]);
    });
    it('generates 30-minute labels', () => {
      const labels = generateTimeLabels(540, 660, 30);
      expect(labels).toHaveLength(4);
      expect(labels[1].label).toBe('09:30');
    });
  });

  describe('clampBlockToWorkday', () => {
    const wdStart = 540; // 09:00
    const wdEnd = 1020;  // 17:00

    it('passes through block fully within workday', () => {
      expect(clampBlockToWorkday(600, 660, wdStart, wdEnd)).toEqual({
        startMinute: 600,
        endMinute: 660
      });
    });
    it('clamps block that starts before workday', () => {
      expect(clampBlockToWorkday(480, 600, wdStart, wdEnd)).toEqual({
        startMinute: 540,
        endMinute: 600
      });
    });
    it('clamps block that ends after workday', () => {
      expect(clampBlockToWorkday(960, 1080, wdStart, wdEnd)).toEqual({
        startMinute: 960,
        endMinute: 1020
      });
    });
    it('returns null for block entirely outside workday', () => {
      expect(clampBlockToWorkday(420, 500, wdStart, wdEnd)).toBeNull();
    });
  });

  describe('formatDayHeader', () => {
    it('formats a Tuesday', () => {
      expect(formatDayHeader('2026-02-10')).toBe('Tue 10');
    });
    it('formats a Sunday', () => {
      expect(formatDayHeader('2026-02-15')).toBe('Sun 15');
    });
  });

  describe('addDaysToYmd', () => {
    it('adds 0 days', () => {
      expect(addDaysToYmd('2026-02-10', 0)).toBe('2026-02-10');
    });
    it('adds 3 days', () => {
      expect(addDaysToYmd('2026-02-10', 3)).toBe('2026-02-13');
    });
    it('handles month boundary', () => {
      expect(addDaysToYmd('2026-02-27', 5)).toBe('2026-03-04');
    });
  });

  describe('getBusyBlockTextStyle', () => {
    it('uses high-contrast dark text for light mode', () => {
      expect(getBusyBlockTextStyle()).toEqual({
        titleColor: '#334155',
        locationColor: '#475569'
      });
    });

    it('uses light text for dark mode', () => {
      expect(getBusyBlockTextStyle(true)).toEqual({
        titleColor: '#cbd5e1',
        locationColor: '#94a3b8'
      });
    });
  });

  describe('withAlpha', () => {
    it('converts #rrggbb to rgba()', () => {
      expect(withAlpha('#3b82f6', 0.25)).toBe('rgba(59, 130, 246, 0.25)');
    });

    it('converts #rgb to rgba()', () => {
      expect(withAlpha('#abc', 0.4)).toBe('rgba(170, 187, 204, 0.4)');
    });

    it('falls back to default slate when input is not hex', () => {
      expect(withAlpha('not-a-color', 0.25)).toBe('rgba(148, 163, 184, 0.25)');
    });
  });
});

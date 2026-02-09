import { describe, expect, it } from 'vitest';
import {
  formatMinutes,
  formatPlanRange,
  formatBlockTime,
  formatExpiresAt
} from './calendar-panel-helpers';

describe('calendar-panel-helpers', () => {
  it('formats minutes into compact labels', () => {
    expect(formatMinutes(45)).toBe('45m');
    expect(formatMinutes(90)).toBe('1h 30m');
    expect(formatMinutes(120)).toBe('2h');
  });

  it('formats date range labels for plan header', () => {
    expect(formatPlanRange('2026-02-10', '2026-02-16')).toContain('Feb');
    expect(formatPlanRange('invalid', '2026-02-16')).toBe('invalid - 2026-02-16');
  });

  it('formats calendar block timestamps', () => {
    expect(formatBlockTime('2026-02-10T09:00:00.000Z', '2026-02-10T09:45:00.000Z')).toContain('Feb');
    expect(formatBlockTime('2026-02-10T09:00:00.000Z', '2026-02-10T09:45:00.000Z')).toContain('-');
    expect(formatBlockTime('bad', 'bad')).toBe('bad');
  });

  it('formats token expiry labels', () => {
    expect(formatExpiresAt('2026-03-01T12:00:00.000Z')).toContain('2026');
    expect(formatExpiresAt('bad-value')).toBe('bad-value');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildTaskDuePayload,
  buildTaskFixedPayload,
  formatTaskDeadline,
  parseTaskDateTime,
  selectTaskDueInput
} from './entry-modal-task-schedule-helpers';

describe('parseTaskDateTime', () => {
  it('keeps date-only values without applying timezone shifts', () => {
    expect(parseTaskDateTime('2026-03-11')).toEqual({
      date: '2026-03-11',
      time: '',
      hasTime: false
    });
  });

  it('parses datetime values into local date and time', () => {
    const parsed = parseTaskDateTime('2026-03-11T14:30:00.000Z');
    expect(parsed.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(parsed.time).toMatch(/^\d{2}:\d{2}$/);
    expect(parsed.hasTime).toBe(true);
  });

  it('returns empty draft for invalid values', () => {
    expect(parseTaskDateTime('not-a-date')).toEqual({
      date: '',
      time: '',
      hasTime: false
    });
  });
});

describe('buildTaskDuePayload', () => {
  it('builds date-only payload when time is disabled', () => {
    const payload = buildTaskDuePayload({
      date: '2026-03-11',
      time: '',
      hasTime: false
    });
    expect(payload).toEqual({
      due_date: '2026-03-11'
    });
    expect('due_at' in payload).toBe(false);
  });

  it('builds due_at payload when time is enabled', () => {
    const payload = buildTaskDuePayload({
      date: '2026-03-11',
      time: '16:45',
      hasTime: true
    });
    expect(payload.due_date).toBe('2026-03-11');
    expect(payload.due_at).toMatch(/^2026-03-11T/);
  });

  it('throws for missing deadline time when enabled', () => {
    expect(() =>
      buildTaskDuePayload({
        date: '2026-03-11',
        time: '',
        hasTime: true
      })
    ).toThrow('Deadline time is required');
  });
});

describe('buildTaskFixedPayload', () => {
  it('returns null when no fixed date is provided', () => {
    expect(
      buildTaskFixedPayload({
        date: '',
        time: '',
        hasTime: false
      })
    ).toEqual({ fixed_at: null });
  });

  it('throws if fixed date is set without time', () => {
    expect(() =>
      buildTaskFixedPayload({
        date: '2026-03-11',
        time: '',
        hasTime: false
      })
    ).toThrow('Fixed time requires both date and time.');
  });

  it('builds fixed_at timestamp when date and time are set', () => {
    const payload = buildTaskFixedPayload({
      date: '2026-03-11',
      time: '10:15',
      hasTime: true
    });
    expect(payload.fixed_at).toMatch(/^2026-03-11T/);
  });
});

describe('selectTaskDueInput', () => {
  it('prefers due_date for midnight UTC due_at values', () => {
    expect(selectTaskDueInput('2026-03-11', '2026-03-11T00:00:00.000Z')).toBe('2026-03-11');
  });

  it('uses due_at for real date-time values', () => {
    expect(selectTaskDueInput('2026-03-11', '2026-03-11T15:30:00.000Z')).toBe('2026-03-11T15:30:00.000Z');
  });
});

describe('formatTaskDeadline', () => {
  it('renders date-only deadline without a clock time', () => {
    const value = formatTaskDeadline('2026-03-11', '2026-03-11T00:00:00.000Z');
    expect(value).toContain('2026');
    expect(value).not.toContain(':');
  });

  it('renders datetime deadlines with a clock time', () => {
    const value = formatTaskDeadline('2026-03-11', '2026-03-11T15:30:00.000Z');
    expect(value).toContain('2026');
    expect(value).toContain(':');
  });
});

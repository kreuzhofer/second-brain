import { normalizeDueDate } from '../../../src/utils/date';

describe('normalizeDueDate', () => {
  const baseDate = new Date(Date.UTC(2026, 1, 5, 12, 0, 0)); // 2026-02-05
  const options = { now: baseDate, timeZone: 'UTC' };

  it('returns ISO date when dueDate is already valid and no relative hint', () => {
    const result = normalizeDueDate('2026-02-10', 'Finish the report', options);
    expect(result).toBe('2026-02-10');
  });

  it('uses relative date when text contains "tomorrow" even if dueDate is wrong', () => {
    const result = normalizeDueDate('2023-02-06', 'Do this tomorrow', options);
    expect(result).toBe('2026-02-06');
  });

  it('parses weekday references to the next occurrence', () => {
    const result = normalizeDueDate(undefined, 'Follow up on Monday', options);
    expect(result).toBe('2026-02-09');
  });

  it('returns undefined when no date is provided and no relative hint exists', () => {
    const result = normalizeDueDate(undefined, 'No due date mentioned', options);
    expect(result).toBeUndefined();
  });
});

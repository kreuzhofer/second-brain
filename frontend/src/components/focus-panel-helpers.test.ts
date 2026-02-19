import { describe, expect, it } from 'vitest';
import {
  getVisibleItems,
  parseCalendarViewMode,
  parseFocusPanelTab,
  shouldShowExpandToggle
} from './focus-panel-helpers';

describe('focus-panel-helpers', () => {
  it('returns limited items when collapsed', () => {
    const items = ['a', 'b', 'c', 'd'];
    expect(getVisibleItems(items, false, 2)).toEqual(['a', 'b']);
  });

  it('returns all items when expanded', () => {
    const items = ['a', 'b', 'c', 'd'];
    expect(getVisibleItems(items, true, 2)).toEqual(items);
  });

  it('shows expand toggle only when total exceeds max', () => {
    expect(shouldShowExpandToggle(6, 5)).toBe(true);
    expect(shouldShowExpandToggle(5, 5)).toBe(false);
    expect(shouldShowExpandToggle(4, 5)).toBe(false);
  });

  it('parses valid focus panel tabs', () => {
    expect(parseFocusPanelTab('focus')).toBe('focus');
    expect(parseFocusPanelTab('calendar')).toBe('calendar');
  });

  it('returns null for invalid focus panel tabs', () => {
    expect(parseFocusPanelTab('unknown')).toBeNull();
    expect(parseFocusPanelTab(null)).toBeNull();
  });

  it('parses valid calendar view modes', () => {
    expect(parseCalendarViewMode('list')).toBe('list');
    expect(parseCalendarViewMode('board')).toBe('board');
  });

  it('returns null for invalid calendar view modes', () => {
    expect(parseCalendarViewMode('month')).toBeNull();
    expect(parseCalendarViewMode(undefined)).toBeNull();
  });
});

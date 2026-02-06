import { describe, it, expect } from 'vitest';
import { getMarkDoneButtonState } from './deep-focus-helpers';

describe('getMarkDoneButtonState', () => {
  it('shows spinner and disables when marking done', () => {
    const state = getMarkDoneButtonState(true);
    expect(state.disabled).toBe(true);
    expect(state.showSpinner).toBe(true);
    expect(state.label).toBe('Marking done...');
  });

  it('shows idle label when not marking done', () => {
    const state = getMarkDoneButtonState(false);
    expect(state.disabled).toBe(false);
    expect(state.showSpinner).toBe(false);
    expect(state.label).toBe('Mark done');
  });
});

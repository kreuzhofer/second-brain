import { describe, it, expect } from 'vitest';
import { hasNotesChanges, resizeTextarea, shouldPromptUnsavedNotes } from './entry-modal-helpers';

describe('hasNotesChanges', () => {
  it('returns false when notes are unchanged', () => {
    expect(hasNotesChanges('Same notes', 'Same notes')).toBe(false);
    expect(hasNotesChanges(undefined, '')).toBe(false);
  });

  it('returns true when notes differ', () => {
    expect(hasNotesChanges('Old', 'New')).toBe(true);
    expect(hasNotesChanges('', 'Added')).toBe(true);
  });
});

describe('shouldPromptUnsavedNotes', () => {
  it('returns true when editing with changes', () => {
    expect(shouldPromptUnsavedNotes(true, 'Old', 'New')).toBe(true);
  });

  it('returns false when not editing or unchanged', () => {
    expect(shouldPromptUnsavedNotes(false, 'Old', 'New')).toBe(false);
    expect(shouldPromptUnsavedNotes(true, 'Same', 'Same')).toBe(false);
  });
});

describe('resizeTextarea', () => {
  it('sets height based on scrollHeight', () => {
    const element = { style: { height: '0px' }, scrollHeight: 240 };
    resizeTextarea(element);
    expect(element.style.height).toBe('240px');
  });
});

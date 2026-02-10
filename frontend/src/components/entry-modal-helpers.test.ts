import { describe, it, expect, vi } from 'vitest';
import {
  hasNotesChanges,
  resizeTextarea,
  runMutationAndRefresh,
  shouldPromptUnsavedNotes
} from './entry-modal-helpers';

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

describe('runMutationAndRefresh', () => {
  it('runs mutation and then refreshes entries', async () => {
    const calls: string[] = [];
    const result = await runMutationAndRefresh(
      async () => {
        calls.push('mutate');
        return 'ok';
      },
      async () => {
        calls.push('refresh');
      }
    );

    expect(result).toBe('ok');
    expect(calls).toEqual(['mutate', 'refresh']);
  });

  it('does not refresh when mutation fails', async () => {
    const refresh = vi.fn();

    await expect(
      runMutationAndRefresh(
        async () => {
          throw new Error('failed');
        },
        refresh
      )
    ).rejects.toThrow('failed');

    expect(refresh).not.toHaveBeenCalled();
  });

  it('returns result and reports refresh errors without failing mutation', async () => {
    const onRefreshError = vi.fn();

    const result = await runMutationAndRefresh(
      async () => 'ok',
      async () => {
        throw new Error('refresh failed');
      },
      onRefreshError
    );

    expect(result).toBe('ok');
    expect(onRefreshError).toHaveBeenCalledTimes(1);
  });
});

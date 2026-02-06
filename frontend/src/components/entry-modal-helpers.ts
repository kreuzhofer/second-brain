export const normalizeNotes = (value?: string | null): string => value ?? '';

export const hasNotesChanges = (original?: string | null, draft?: string | null): boolean => {
  return normalizeNotes(original) !== normalizeNotes(draft);
};

export const shouldPromptUnsavedNotes = (
  isEditing: boolean,
  original?: string | null,
  draft?: string | null
): boolean => {
  return isEditing && hasNotesChanges(original, draft);
};

export const resizeTextarea = (
  element?: { style: { height: string }; scrollHeight: number } | null
): void => {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
};

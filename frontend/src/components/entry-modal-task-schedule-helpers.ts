export interface DateTimeDraft {
  date: string;
  time: string;
  hasTime: boolean;
}

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const isMidnightUtc = (value: string): boolean => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return (
    parsed.getUTCHours() === 0 &&
    parsed.getUTCMinutes() === 0 &&
    parsed.getUTCSeconds() === 0 &&
    parsed.getUTCMilliseconds() === 0
  );
};

export const parseTaskDateTime = (value: unknown): DateTimeDraft => {
  if (typeof value !== 'string' || !value) {
    return { date: '', time: '', hasTime: false };
  }

  if (ISO_DATE_ONLY.test(value)) {
    return { date: value, time: '', hasTime: false };
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return { date: '', time: '', hasTime: false };
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    hasTime: true
  };
};

export const selectTaskDueInput = (dueDate: unknown, dueAt: unknown): string => {
  const dueDateValue = typeof dueDate === 'string' ? dueDate : '';
  const dueAtValue = typeof dueAt === 'string' ? dueAt : '';

  if (dueAtValue) {
    // Backend currently emits due_at even for date-only entries (midnight UTC).
    // Treat those as date-only to avoid confusing fake local times like 01:00.
    if (isMidnightUtc(dueAtValue) && dueDateValue) {
      return dueDateValue;
    }
    return dueAtValue;
  }

  return dueDateValue;
};

export const formatTaskDeadline = (dueDate: unknown, dueAt: unknown): string => {
  const selected = selectTaskDueInput(dueDate, dueAt);
  if (!selected) return '-';

  if (ISO_DATE_ONLY.test(selected)) {
    return new Date(`${selected}T00:00:00`).toLocaleDateString();
  }

  const parsed = new Date(selected);
  if (Number.isNaN(parsed.getTime())) return String(selected);
  return parsed.toLocaleString();
};

export const combineLocalDateAndTime = (date: string, time: string): string => {
  const parsed = new Date(`${date}T${time}`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error('Invalid date/time value');
  }
  return parsed.toISOString();
};

export const buildTaskDuePayload = (
  draft: DateTimeDraft
): { due_date: string | null; due_at?: string | null } => {
  if (!draft.date) {
    return { due_date: null, due_at: null };
  }

  if (!draft.hasTime) {
    // Important: omit due_at so backend keeps due_date instead of nulling it.
    return { due_date: draft.date };
  }

  if (!draft.time) {
    throw new Error('Deadline time is required when time is enabled.');
  }

  return {
    due_date: draft.date,
    due_at: combineLocalDateAndTime(draft.date, draft.time)
  };
};

export const buildTaskFixedPayload = (draft: DateTimeDraft): { fixed_at: string | null } => {
  if (!draft.date) {
    return { fixed_at: null };
  }

  if (!draft.hasTime || !draft.time) {
    throw new Error('Fixed time requires both date and time.');
  }

  return {
    fixed_at: combineLocalDateAndTime(draft.date, draft.time)
  };
};

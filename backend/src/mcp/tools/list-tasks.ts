import { EntryService, getEntryService } from '../../services/entry.service';
import { AdminStatus, EntrySummary } from '../../types/entry.types';

export interface ListTasksInput {
  status?: AdminStatus;
  include_done?: boolean;
}

export interface TaskSummary {
  path: string;
  name: string;
  status?: string;
  due_date?: string;
  due_at?: string;
  duration_minutes?: number;
  priority?: number;
  updated_at: string;
}

export const LIST_TASKS_TOOL_DEFINITION = {
  name: 'list_tasks',
  description: 'List tasks. By default shows only pending tasks. Use status filter or include_done to see completed tasks.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      status: { type: 'string', enum: ['pending', 'done'], description: 'Filter by status (default: pending)' },
      include_done: { type: 'boolean', description: 'If true, list all tasks regardless of status. Overrides status filter.' }
    },
    required: []
  }
};

export async function handleListTasks(
  input: ListTasksInput,
  entryService?: EntryService
): Promise<TaskSummary[]> {
  const svc = entryService || getEntryService();

  const filters = input.include_done
    ? {}
    : { status: input.status || 'pending' };

  const entries: EntrySummary[] = await svc.list('task', filters);

  return entries.map((e) => ({
    path: e.path,
    name: e.name,
    status: e.status,
    due_date: e.due_date,
    due_at: e.due_at,
    duration_minutes: e.duration_minutes,
    priority: e.priority,
    updated_at: e.updated_at
  }));
}

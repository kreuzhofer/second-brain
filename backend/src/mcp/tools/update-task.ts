import { EntryService, getEntryService } from '../../services/entry.service';
import { UpdateAdminInput, AdminStatus, BodyContentUpdate } from '../../types/entry.types';

export interface UpdateTaskInput {
  path: string;
  name?: string;
  status?: AdminStatus;
  due_date?: string | null;
  due_at?: string | null;
  duration_minutes?: number;
  priority?: number;
  pinned?: boolean;
  not_before?: string | null;
  tags?: string[];
  description?: string;
}

export const UPDATE_TASK_TOOL_DEFINITION = {
  name: 'update_task',
  description: 'Update an existing task. Use search_brain or list_tasks to find the task path first. Can update any task field including marking it as done.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Task path, e.g. "task/grocery-shopping"' },
      name: { type: 'string', description: 'New task name' },
      status: { type: 'string', enum: ['pending', 'done'], description: 'Task status' },
      due_date: { type: ['string', 'null'], description: 'Due date (YYYY-MM-DD) or null to clear' },
      due_at: { type: ['string', 'null'], description: 'Due datetime (ISO 8601) or null to clear' },
      duration_minutes: { type: 'number', description: 'Estimated duration in minutes (5-720)' },
      priority: { type: 'number', description: 'Priority level 1-5 (1 = highest)' },
      pinned: { type: 'boolean', description: 'If true, task is pinned to the exact due_at datetime' },
      not_before: { type: ['string', 'null'], description: 'Do not schedule before this date (ISO 8601) or null to clear' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Replace tags' },
      description: { type: 'string', description: 'Replace task description/notes' }
    },
    required: ['path']
  }
};

export async function handleUpdateTask(
  input: UpdateTaskInput,
  entryService?: EntryService
): Promise<{ path: string; message: string }> {
  if (!input.path.startsWith('task/')) {
    throw new Error(`Invalid task path: "${input.path}". Task paths must start with "task/".`);
  }

  const svc = entryService || getEntryService();

  const updates: UpdateAdminInput = {};
  if (input.name !== undefined) updates.name = input.name;
  if (input.status !== undefined) updates.status = input.status;
  if (input.due_date !== undefined) updates.due_date = input.due_date;
  if (input.due_at !== undefined) updates.due_at = input.due_at;
  if (input.duration_minutes !== undefined) updates.duration_minutes = input.duration_minutes;
  if (input.priority !== undefined) updates.priority = input.priority;
  if (input.pinned !== undefined) updates.pinned = input.pinned;
  if (input.not_before !== undefined) updates.not_before = input.not_before;
  if (input.tags !== undefined) updates.tags = input.tags;

  let bodyUpdate: BodyContentUpdate | undefined;
  if (input.description !== undefined) {
    bodyUpdate = { content: input.description, mode: 'replace' };
  }

  await svc.update(input.path, updates, 'api', bodyUpdate);

  return {
    path: input.path,
    message: input.status === 'done' ? 'Task marked as done' : 'Task updated'
  };
}

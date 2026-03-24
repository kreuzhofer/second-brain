import { EntryService, getEntryService } from '../../services/entry.service';
import { SearchService, getSearchService } from '../../services/search.service';

export interface CreateTaskInput {
  name: string;
  due_date?: string;
  due_at?: string;
  duration_minutes?: number;
  priority?: number;
  tags?: string[];
  description?: string;
}

export const CREATE_TASK_TOOL_DEFINITION = {
  name: 'create_task',
  description: 'Create a new task in the knowledge base. Tasks are single actionable items with optional due dates, durations, and priorities.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Task name/title' },
      due_date: { type: 'string', description: 'Optional due date in YYYY-MM-DD format' },
      due_at: { type: 'string', description: 'Optional due datetime in ISO 8601 format' },
      duration_minutes: { type: 'number', description: 'Estimated duration in minutes (5-720)' },
      priority: { type: 'number', description: 'Priority level 1-5 (1 = highest)' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for categorization' },
      description: { type: 'string', description: 'Optional detailed description / notes for the task' }
    },
    required: ['name']
  }
};

export async function handleCreateTask(
  input: CreateTaskInput,
  entryService?: EntryService,
  searchService?: SearchService
): Promise<{ path: string; id: string; message: string }> {
  const svc = entryService || getEntryService();
  const search = searchService || getSearchService();

  const result = await svc.create(
    'task',
    {
      name: input.name,
      status: 'pending',
      due_date: input.due_date,
      due_at: input.due_at,
      duration_minutes: input.duration_minutes,
      priority: input.priority,
      tags: input.tags || [],
      source_channel: 'api',
      confidence: 1.0
    },
    'api',
    input.description
  );

  // Fire-and-forget embedding generation
  const embeddingText = [input.name, input.description].filter(Boolean).join('\n');
  (search as any).ensureEmbedding(result.entry.id, embeddingText)
    .catch(() => { /* best-effort */ });

  return {
    path: result.path,
    id: result.entry.id,
    message: 'Task created'
  };
}

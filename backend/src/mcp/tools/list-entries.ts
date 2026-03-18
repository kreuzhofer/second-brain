import { EntryService, getEntryService } from '../../services/entry.service';
import { Category } from '../../types/entry.types';

export interface ListEntriesInput {
  category?: Category;
  status?: string;
  limit?: number;
}

export interface ListEntriesResult {
  id: string;
  path: string;
  name: string;
  category: string;
  updated_at: string;
  status?: string;
  agent_name?: string;
  memory_type?: string;
}

export const LIST_ENTRIES_TOOL_DEFINITION = {
  name: 'list_entries',
  description: "List entries from the user's JustDo.so knowledge base. Optionally filter by category and status. Returns summaries, not full content — use get_entry for details.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        enum: ['people', 'projects', 'ideas', 'task', 'admin', 'inbox', 'memory'],
        description: 'Optional category filter'
      },
      status: { type: 'string', description: 'Optional status filter (e.g. "active", "pending", "done")' },
      limit: { type: 'number', description: 'Max results to return (default 20)' }
    }
  }
};

export async function handleListEntries(
  input: ListEntriesInput,
  entryService?: EntryService
): Promise<ListEntriesResult[]> {
  const svc = entryService || getEntryService();
  const limit = input.limit ?? 20;

  const entries = await svc.list(input.category, {
    status: input.status
  });

  return entries.slice(0, limit).map((entry) => ({
    id: entry.id,
    path: entry.path,
    name: entry.name,
    category: entry.category,
    updated_at: entry.updated_at,
    status: entry.status,
    agent_name: entry.agent_name,
    memory_type: entry.memory_type
  }));
}

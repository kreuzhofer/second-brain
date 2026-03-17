import { EntryService, getEntryService } from '../../services/entry.service';
import { SearchService, getSearchService } from '../../services/search.service';
import { MemoryType } from '../../types/entry.types';

export interface RecallMemoriesInput {
  query: string;
  memory_type?: MemoryType;
  agent_id?: string;
  limit?: number;
}

export interface RecalledMemory {
  title: string;
  content: string;
  memory_type: string;
  agent_name: string;
  score: number;
  created_at: string;
}

export const RECALL_MEMORIES_TOOL_DEFINITION = {
  name: 'recall_memories',
  description: 'Search for previously stored memories about the user. Use this to recall facts, preferences, feedback, and context from prior conversations.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      memory_type: {
        type: 'string',
        enum: ['fact', 'preference', 'context', 'feedback', 'relationship'],
        description: 'Optional filter by memory type'
      },
      agent_id: { type: 'string', description: 'Optional filter by agent that stored the memory' },
      limit: { type: 'number', description: 'Max results to return (default 10)' }
    },
    required: ['query']
  }
};

export async function handleRecallMemories(
  input: RecallMemoriesInput,
  entryService?: EntryService,
  searchService?: SearchService
): Promise<RecalledMemory[]> {
  const svc = entryService || getEntryService();
  const search = searchService || getSearchService();

  const limit = input.limit ?? 10;

  const results = await search.search(input.query, {
    category: 'memory',
    limit
  });

  const memories: RecalledMemory[] = [];
  for (const hit of results.entries) {
    try {
      const full = await svc.read(hit.path);
      const entry = full.entry as any;

      // Apply optional filters
      if (input.memory_type && entry.memory_type !== input.memory_type) continue;
      if (input.agent_id && entry.agent_id !== input.agent_id) continue;

      memories.push({
        title: hit.name,
        content: full.content || '',
        memory_type: entry.memory_type || 'context',
        agent_name: entry.agent_name || 'Unknown',
        score: hit.score || 0,
        created_at: entry.created_at || ''
      });
    } catch {
      // Skip entries that can't be read
    }
  }

  return memories;
}

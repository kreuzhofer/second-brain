import { SearchService, getSearchService } from '../../services/search.service';
import { Category } from '../../types/entry.types';

export interface SearchBrainInput {
  query: string;
  category?: Category;
  limit?: number;
}

export interface SearchBrainResult {
  path: string;
  name: string;
  category: string;
  snippet: string;
  score: number;
}

export const SEARCH_BRAIN_TOOL_DEFINITION = {
  name: 'search_brain',
  description: "Search the user's JustDo.so knowledge base for entries about people, projects, ideas, tasks, and memories. Returns matching entries with relevance scores.",
  inputSchema: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Natural language search query' },
      category: {
        type: 'string',
        enum: ['people', 'projects', 'ideas', 'task', 'admin', 'memory'],
        description: 'Optional filter by category'
      },
      limit: { type: 'number', description: 'Max results to return (default 10)' }
    },
    required: ['query']
  }
};

export async function handleSearchBrain(
  input: SearchBrainInput,
  searchService?: SearchService
): Promise<SearchBrainResult[]> {
  const search = searchService || getSearchService();

  const results = await search.search(input.query, {
    category: input.category,
    limit: input.limit ?? 10
  });

  return results.entries.map((hit) => ({
    path: hit.path,
    name: hit.name,
    category: hit.category,
    snippet: hit.snippet,
    score: hit.score || 0
  }));
}

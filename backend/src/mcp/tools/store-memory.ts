import { EntryService, getEntryService } from '../../services/entry.service';
import { SearchService, getSearchService } from '../../services/search.service';
import { MemoryType } from '../../types/entry.types';

export interface StoreMemoryInput {
  content: string;
  title: string;
  memory_type: MemoryType;
  tags?: string[];
  confidence?: number;
  expires_at?: string;
  source_conversation_id?: string;
}

export const STORE_MEMORY_TOOL_DEFINITION = {
  name: 'store_memory',
  description: 'Store a memory about the user. Memories persist across conversations and help you provide better, personalized assistance. Use this for facts, preferences, feedback, context, and relationships.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Short title for the memory' },
      content: { type: 'string', description: 'The memory content in detail' },
      memory_type: {
        type: 'string',
        enum: ['fact', 'preference', 'context', 'feedback', 'relationship'],
        description: 'Type of memory: fact (about the user), preference (how they like things), context (project/work context), feedback (corrections/guidance), relationship (connections between people/things)'
      },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags for categorization' },
      confidence: { type: 'number', description: 'Confidence level 0-1 (default 1.0)' },
      expires_at: { type: 'string', description: 'Optional ISO datetime when this memory should expire' },
      source_conversation_id: { type: 'string', description: 'Optional conversation ID where this memory originated' }
    },
    required: ['title', 'content', 'memory_type']
  }
};

export async function handleStoreMemory(
  input: StoreMemoryInput,
  agentId: string,
  agentName: string,
  entryService?: EntryService,
  searchService?: SearchService
): Promise<{ path: string; id: string; message: string }> {
  const svc = entryService || getEntryService();
  const search = searchService || getSearchService();

  const result = await svc.create(
    'memory',
    {
      name: input.title,
      agent_id: agentId,
      agent_name: agentName,
      memory_type: input.memory_type,
      confidence: input.confidence ?? 1.0,
      expires_at: input.expires_at,
      source_conversation_id: input.source_conversation_id,
      tags: input.tags || [],
      source_channel: 'api'
    },
    'api',
    input.content
  );

  // Generate embedding synchronously for immediate recallability
  try {
    await (search as any).ensureEmbedding(
      result.entry.id,
      `${input.title}\n[${input.memory_type}]\n${input.content}`
    );
  } catch {
    // Embedding generation is best-effort
  }

  return {
    path: result.path,
    id: result.entry.id,
    message: 'Memory stored'
  };
}

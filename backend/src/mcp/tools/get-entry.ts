import { EntryService, getEntryService } from '../../services/entry.service';

export interface GetEntryInput {
  path: string;
}

export interface GetEntryResult {
  path: string;
  category: string;
  entry: Record<string, unknown>;
  content: string;
}

export const GET_ENTRY_TOOL_DEFINITION = {
  name: 'get_entry',
  description: 'Get the full details of a specific entry by its path (e.g. "projects/my-app", "people/jane-doe"). Returns all metadata and content.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Entry path, e.g. "projects/my-app"' }
    },
    required: ['path']
  }
};

export async function handleGetEntry(
  input: GetEntryInput,
  entryService?: EntryService
): Promise<GetEntryResult> {
  const svc = entryService || getEntryService();

  const result = await svc.read(input.path);

  return {
    path: result.path,
    category: result.category,
    entry: result.entry as unknown as Record<string, unknown>,
    content: result.content
  };
}

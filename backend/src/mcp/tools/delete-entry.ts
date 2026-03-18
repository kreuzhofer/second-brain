import { EntryService, getEntryService } from '../../services/entry.service';

export interface DeleteEntryInput {
  path: string;
  confirm: boolean;
}

export const DELETE_ENTRY_TOOL_DEFINITION = {
  name: 'delete_entry',
  description: 'Delete an entry from the knowledge base. Requires the user to explicitly ask for deletion. Always confirm with the user before calling this tool. If only a title/name is known, use search_brain first to find the exact path.',
  inputSchema: {
    type: 'object' as const,
    properties: {
      path: { type: 'string', description: 'Entry path to delete, e.g. "memory/my-preference", "task/grocery-shopping", "people/jane-doe"' },
      confirm: { type: 'boolean', description: 'Must be true to confirm deletion. Always ask the user for confirmation first.' }
    },
    required: ['path', 'confirm']
  }
};

export async function handleDeleteEntry(
  input: DeleteEntryInput,
  entryService?: EntryService
): Promise<{ path: string; message: string }> {
  if (!input.confirm) {
    return {
      path: input.path,
      message: 'Deletion not confirmed. Please ask the user to confirm before deleting.'
    };
  }

  const svc = entryService || getEntryService();
  await svc.delete(input.path, 'api');

  return {
    path: input.path,
    message: 'Entry deleted'
  };
}

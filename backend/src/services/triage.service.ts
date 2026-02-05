/**
 * Inbox Triage Service
 * Batch operations for inbox entries (move, resolve, merge).
 */

import { EntryService, getEntryService, InvalidEntryDataError } from './entry.service';
import { Category, Channel, EntryWithPath, InboxEntry } from '../types/entry.types';

export class TriageService {
  private entryService: EntryService;

  constructor(entryService?: EntryService) {
    this.entryService = entryService || getEntryService();
  }

  async move(paths: string[], targetCategory: Category, channel: Channel = 'api'): Promise<EntryWithPath[]> {
    const results: EntryWithPath[] = [];
    for (const path of paths) {
      results.push(await this.entryService.move(path, targetCategory, channel));
    }
    return results;
  }

  async resolve(paths: string[], channel: Channel = 'api'): Promise<void> {
    for (const path of paths) {
      await this.entryService.delete(path, channel);
    }
  }

  async merge(paths: string[], targetPath: string, channel: Channel = 'api'): Promise<EntryWithPath> {
    if (!targetPath) {
      throw new InvalidEntryDataError('Target path is required for merge');
    }

    const mergeLines: string[] = [];
    for (const path of paths) {
      const entry = await this.entryService.read(path);
      if (entry.category !== 'inbox') {
        throw new InvalidEntryDataError(`Only inbox entries can be merged: ${path}`);
      }
      const inboxEntry = entry.entry as InboxEntry;
      const label = inboxEntry.suggested_name || 'Untitled';
      const text = inboxEntry.original_text || '';
      mergeLines.push(`- ${label}: ${text}`);
    }

    const mergedContent = mergeLines.join('\n');
    const updated = await this.entryService.update(
      targetPath,
      {},
      channel,
      {
        mode: 'section',
        section: 'Inbox Merge',
        content: mergedContent
      }
    );

    for (const path of paths) {
      await this.entryService.delete(path, channel);
    }

    return updated;
  }
}

let triageServiceInstance: TriageService | null = null;

export function getTriageService(entryService?: EntryService): TriageService {
  if (!triageServiceInstance || entryService) {
    triageServiceInstance = new TriageService(entryService);
  }
  return triageServiceInstance;
}

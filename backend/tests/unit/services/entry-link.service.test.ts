/**
 * Unit tests for EntryLinkService
 */

import { EntryService } from '../../../src/services/entry.service';
import { EntryLinkService } from '../../../src/services/entry-link.service';

describe('EntryLinkService', () => {
  let entryService: EntryService;
  let linkService: EntryLinkService;

  beforeEach(() => {
    entryService = new EntryService();
    linkService = new EntryLinkService(entryService);
  });

  it('creates people entries and links them from admin tasks', async () => {
    let adminEntryPath = '';
    let personEntryPath = '';
    const stripMd = (path: string) => (path.endsWith('.md') ? path.slice(0, -3) : path);

    try {
      const adminEntry = await entryService.create(
        'admin',
        {
          name: 'Call Lina Haidu',
          status: 'pending',
          source_channel: 'chat',
          confidence: 0.8
        },
        'chat'
      );
      adminEntryPath = adminEntry.path;

      await linkService.linkPeopleForEntry(adminEntry, ['Lina Haidu'], 'chat');

      const personEntry = await entryService.read('people/lina-haidu');
      personEntryPath = personEntry.path;
      const linksFromAdmin = await linkService.getLinksForPath(adminEntry.path);
      const linksToPerson = await linkService.getLinksForPath(personEntry.path);

      expect(linksFromAdmin.outgoing).toContainEqual({
        path: stripMd(personEntry.path),
        category: 'people',
        name: (personEntry.entry as any).name
      });

      expect(linksToPerson.incoming).toContainEqual({
        path: stripMd(adminEntry.path),
        category: 'admin',
        name: (adminEntry.entry as any).name
      });
    } finally {
      if (personEntryPath) {
        await entryService.delete(personEntryPath, 'chat');
      }
      if (adminEntryPath) {
        await entryService.delete(adminEntryPath, 'chat');
      }
    }
  });
});

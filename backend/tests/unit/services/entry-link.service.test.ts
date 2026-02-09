/**
 * Unit tests for EntryLinkService
 */

import { EntryService } from '../../../src/services/entry.service';
import { EntryLinkService } from '../../../src/services/entry-link.service';

describe('EntryLinkService', () => {
  let entryService: EntryService;
  let linkService: EntryLinkService;
  const stripMd = (path: string) => (path.endsWith('.md') ? path.slice(0, -3) : path);

  beforeEach(() => {
    entryService = new EntryService();
    linkService = new EntryLinkService(entryService);
  });

  it('creates people entries and links them from admin tasks', async () => {
    let adminEntryPath = '';
    let personEntryPath = '';

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

  it('returns graph nodes and edges for linked entries', async () => {
    let adminEntryPath = '';
    let personEntryPath = '';

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

      const graph = await linkService.getGraphForPath(adminEntry.path);

      expect(graph.center).toEqual({
        path: stripMd(adminEntry.path),
        category: 'admin',
        name: 'Call Lina Haidu'
      });
      expect(graph.nodes).toEqual(
        expect.arrayContaining([
          {
            path: stripMd(adminEntry.path),
            category: 'admin',
            name: 'Call Lina Haidu'
          },
          {
            path: stripMd(personEntry.path),
            category: 'people',
            name: 'Lina Haidu'
          }
        ])
      );
      expect(graph.edges).toContainEqual({
        source: stripMd(adminEntry.path),
        target: stripMd(personEntry.path),
        type: 'mention'
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

  it('creates missing project entries when write-through is enabled and links them', async () => {
    let adminEntryPath = '';
    let projectEntryPath = '';

    try {
      const adminEntry = await entryService.create(
        'admin',
        {
          name: 'Draft retail demo one pagers',
          status: 'pending',
          source_channel: 'chat',
          confidence: 0.8
        },
        'chat'
      );
      adminEntryPath = adminEntry.path;

      await linkService.linkProjectsForEntry(
        adminEntry,
        ['Retail Demo One Pagers'],
        'chat',
        { createMissing: true }
      );

      const projectEntry = await entryService.read('projects/retail-demo-one-pagers');
      projectEntryPath = projectEntry.path;
      const linksFromAdmin = await linkService.getLinksForPath(adminEntry.path);

      expect(linksFromAdmin.outgoing).toContainEqual({
        path: stripMd(projectEntry.path),
        category: 'projects',
        name: (projectEntry.entry as any).name
      });
    } finally {
      if (projectEntryPath) {
        await entryService.delete(projectEntryPath, 'chat');
      }
      if (adminEntryPath) {
        await entryService.delete(adminEntryPath, 'chat');
      }
    }
  });

  it('ignores invalid people phrases and does not create/link them', async () => {
    let adminEntryPath = '';

    try {
      const adminEntry = await entryService.create(
        'admin',
        {
          name: 'Follow up with editor',
          status: 'pending',
          source_channel: 'chat',
          confidence: 0.8
        },
        'chat'
      );
      adminEntryPath = adminEntry.path;

      await linkService.linkPeopleForEntry(adminEntry, ['Apologies for delays'], 'chat');

      const linksFromAdmin = await linkService.getLinksForPath(adminEntry.path);
      const people = await entryService.list('people');

      expect(linksFromAdmin.outgoing).toEqual([]);
      expect(people).toEqual([]);
    } finally {
      if (adminEntryPath) {
        await entryService.delete(adminEntryPath, 'chat');
      }
    }
  });
});

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
        category: 'task',
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
        category: 'task',
        name: 'Call Lina Haidu'
      });
      expect(graph.nodes).toEqual(
        expect.arrayContaining([
          {
            path: stripMd(adminEntry.path),
            category: 'task',
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

  it('captures a people relationship as two person entries with typed relationship links', async () => {
    let chrisPath = '';
    let amiePath = '';

    try {
      const primary = await linkService.capturePeopleRelationship(
        ['Chris', 'Amie'],
        'relationship',
        'Chris and Amie have a relationship',
        'chat'
      );

      chrisPath = primary.path;
      const chris = await entryService.read('people/chris');
      const amie = await entryService.read('people/amie');
      chrisPath = chris.path;
      amiePath = amie.path;

      const chrisGraph = await linkService.getGraphForPath(chris.path);
      const amieGraph = await linkService.getGraphForPath(amie.path);

      expect(chrisGraph.edges).toEqual(
        expect.arrayContaining([
          {
            source: stripMd(chris.path),
            target: stripMd(amie.path),
            type: 'relationship'
          }
        ])
      );
      expect(amieGraph.edges).toEqual(
        expect.arrayContaining([
          {
            source: stripMd(amie.path),
            target: stripMd(chris.path),
            type: 'relationship'
          }
        ])
      );
    } finally {
      if (amiePath) {
        await entryService.delete(amiePath, 'chat');
      }
      if (chrisPath) {
        await entryService.delete(chrisPath, 'chat');
      }
    }
  });

  it('adds and removes manual outgoing links between existing entries', async () => {
    let adminEntryPath = '';
    let personEntryPath = '';

    try {
      const adminEntry = await entryService.create(
        'admin',
        {
          name: 'Send follow up',
          status: 'pending',
          source_channel: 'chat',
          confidence: 0.7
        },
        'chat'
      );
      adminEntryPath = adminEntry.path;

      const personEntry = await entryService.create(
        'people',
        {
          name: 'Mila Bauer',
          context: 'Vendor contact',
          follow_ups: [],
          related_projects: [],
          source_channel: 'chat',
          confidence: 0.7
        },
        'chat'
      );
      personEntryPath = personEntry.path;

      await linkService.addManualLink(adminEntry.path, personEntry.path);
      let linksFromAdmin = await linkService.getLinksForPath(adminEntry.path);
      expect(linksFromAdmin.outgoing).toContainEqual({
        path: stripMd(personEntry.path),
        category: 'people',
        name: (personEntry.entry as any).name
      });

      const removed = await linkService.removeManualLink(
        adminEntry.path,
        personEntry.path,
        'outgoing'
      );
      expect(removed).toBe(1);

      linksFromAdmin = await linkService.getLinksForPath(adminEntry.path);
      expect(linksFromAdmin.outgoing).toEqual([]);
    } finally {
      if (personEntryPath) {
        await entryService.delete(personEntryPath, 'chat');
      }
      if (adminEntryPath) {
        await entryService.delete(adminEntryPath, 'chat');
      }
    }
  });

  it('removes incoming backlinks for a target entry', async () => {
    let adminEntryPath = '';
    let personEntryPath = '';

    try {
      const adminEntry = await entryService.create(
        'admin',
        {
          name: 'Schedule review',
          status: 'pending',
          source_channel: 'chat',
          confidence: 0.8
        },
        'chat'
      );
      adminEntryPath = adminEntry.path;

      const personEntry = await entryService.create(
        'people',
        {
          name: 'Lena Hart',
          context: 'Design partner',
          follow_ups: [],
          related_projects: [],
          source_channel: 'chat',
          confidence: 0.8
        },
        'chat'
      );
      personEntryPath = personEntry.path;

      await linkService.addManualLink(adminEntry.path, personEntry.path);

      let linksToPerson = await linkService.getLinksForPath(personEntry.path);
      expect(linksToPerson.incoming).toContainEqual({
        path: stripMd(adminEntry.path),
        category: 'task',
        name: (adminEntry.entry as any).name
      });

      const removed = await linkService.removeManualLink(
        personEntry.path,
        adminEntry.path,
        'incoming'
      );
      expect(removed).toBe(1);

      linksToPerson = await linkService.getLinksForPath(personEntry.path);
      expect(linksToPerson.incoming).toEqual([]);
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

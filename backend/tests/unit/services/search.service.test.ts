import { resetDatabase } from '../../setup';
import { SearchService, SearchResult } from '../../../src/services/search.service';
import { EntryService } from '../../../src/services/entry.service';

describe('SearchService', () => {
  let searchService: SearchService;
  let entryService: EntryService;

  beforeEach(async () => {
    await resetDatabase();
    entryService = new EntryService();
    searchService = new SearchService(entryService, undefined, {
      enableSemantic: false
    });
  });

  describe('search', () => {
    it('should return empty results for empty query', async () => {
      const result = await searchService.search('');
      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should return empty results for whitespace-only query', async () => {
      const result = await searchService.search('   ');
      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should find entries by name', async () => {
      await entryService.create('people', {
        name: 'John Smith',
        context: 'A colleague',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await searchService.search('john');
      
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].name).toBe('John Smith');
      expect(result.entries[0].matchedField).toBe('name');
    });

    it('should perform case-insensitive search', async () => {
      await entryService.create('people', {
        name: 'Alice Johnson',
        context: 'Friend',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await searchService.search('ALICE');
      
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].name).toBe('Alice Johnson');
    });

    it('should find entries by one_liner (ideas)', async () => {
      await entryService.create('ideas', {
        name: 'Mobile App',
        one_liner: 'Build a revolutionary mobile application',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await searchService.search('revolutionary');
      
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].name).toBe('Mobile App');
      expect(result.entries[0].matchedField).toBe('one_liner');
    });

    it('should find entries by context (people)', async () => {
      await entryService.create('people', {
        name: 'Bob Wilson',
        context: 'Works at Acme Corporation as a software engineer',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await searchService.search('acme');
      
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].name).toBe('Bob Wilson');
      expect(result.entries[0].matchedField).toBe('context');
    });

    it('should find entries by markdown content', async () => {
      // Create entry
      await entryService.create('projects', {
        name: 'Website Redesign',
        next_action: 'Create mockups',
        source_channel: 'api',
        confidence: 0.9
      }, 'api', '## Notes\n\nThis project involves implementing a new dashboard feature.');

      const result = await searchService.search('dashboard');
      
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].name).toBe('Website Redesign');
      expect(result.entries[0].matchedField).toBe('content');
    });

    it('should find entries by original_text (inbox)', async () => {
      await entryService.create('inbox', {
        original_text: 'Remember to call the dentist tomorrow for checkup',
        suggested_category: 'admin',
        suggested_name: 'Medical Appointment',
        confidence: 0.4,
        source_channel: 'chat'
      });

      const result = await searchService.search('dentist');
      
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].matchedField).toBe('original_text');
    });

    it('should filter by category', async () => {
      await entryService.create('people', {
        name: 'Test Person',
        context: 'Has a project',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('projects', {
        name: 'Test Project',
        next_action: 'Do something',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await searchService.search('test', { category: 'projects' });
      
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].category).toBe('projects');
    });

    it('should apply limit parameter', async () => {
      // Create multiple matching entries
      await entryService.create('people', {
        name: 'Test Person 1',
        context: 'First test',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('people', {
        name: 'Test Person 2',
        context: 'Second test',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('people', {
        name: 'Test Person 3',
        context: 'Third test',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await searchService.search('test', { limit: 2 });
      
      expect(result.entries.length).toBe(2);
      expect(result.total).toBe(3); // Total matches before limit
    });

    it('should sort results by relevance (match count)', async () => {
      // Create entry with multiple matches
      await entryService.create('ideas', {
        name: 'Test Idea',
        one_liner: 'A test idea for testing the test system',
        source_channel: 'api',
        confidence: 0.9
      });
      // Create entry with single match
      await entryService.create('people', {
        name: 'Test Person',
        context: 'No matches here',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await searchService.search('test');
      
      // Entry with more matches should come first
      expect(result.entries[0].name).toBe('Test Idea');
      expect(result.entries[1].name).toBe('Test Person');
    });

    it('should return empty results when no matches found', async () => {
      await entryService.create('people', {
        name: 'John Doe',
        context: 'A person',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await searchService.search('xyz123nonexistent');
      
      expect(result.entries).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('should include snippet with context around match', async () => {
      await entryService.create('people', {
        name: 'Jane Doe',
        context: 'She works at a large technology company in Silicon Valley as a senior engineer',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await searchService.search('silicon');
      
      expect(result.entries.length).toBe(1);
      expect(result.entries[0].snippet).toContain('Silicon');
    });

    it('should search across multiple categories', async () => {
      await entryService.create('people', {
        name: 'Developer John',
        context: 'A developer',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('projects', {
        name: 'Developer Tools',
        next_action: 'Build tools',
        source_channel: 'api',
        confidence: 0.9
      });
      await entryService.create('ideas', {
        name: 'Developer Platform',
        one_liner: 'A platform for developers',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await searchService.search('developer');
      
      expect(result.entries.length).toBe(3);
      const categories = result.entries.map(e => e.category);
      expect(categories).toContain('people');
      expect(categories).toContain('projects');
      expect(categories).toContain('ideas');
    });

    it('should include semantic matches when keyword matches are absent', async () => {
      const makeVector = (a: number, b: number): number[] => {
        const vector = new Array(3072).fill(0);
        vector[0] = a;
        vector[1] = b;
        return vector;
      };

      const mockEmbeddingService = {
        embed: jest.fn(async (text: string) => {
          const normalized = text.toLowerCase();
          if (normalized.includes('strategy') || normalized.includes('roadmap')) {
            return makeVector(1, 0);
          }
          if (normalized.includes('meeting') || normalized.includes('sync')) {
            return makeVector(0, 1);
          }
          return makeVector(0, 0);
        })
      };

      const semanticSearchService = new SearchService(entryService, mockEmbeddingService, {
        enableSemantic: true,
        semanticThreshold: 0.5
      });

      await entryService.create('projects', {
        name: 'Growth Plan',
        next_action: 'Review the roadmap',
        source_channel: 'api',
        confidence: 0.9
      });

      const result = await semanticSearchService.search('strategy');

      expect(result.entries.length).toBe(1);
      expect(result.entries[0].name).toBe('Growth Plan');
      expect(result.entries[0].matchedField).toBe('semantic');
      expect(mockEmbeddingService.embed).toHaveBeenCalled();
    });
  });
});

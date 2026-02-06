import { DuplicateService } from '../../../src/services/duplicate.service';
import { SearchService } from '../../../src/services/search.service';
import { EntryService } from '../../../src/services/entry.service';

describe('DuplicateService', () => {
  it('should return duplicates based on semantic score', async () => {
    const mockSearchService = {
      search: jest.fn().mockResolvedValue({
        entries: [
          {
            path: 'projects/test',
            name: 'Test Project',
            category: 'projects',
            matchedField: 'semantic',
            snippet: 'Test',
            semanticScore: 0.9
          }
        ],
        total: 1
      })
    } as unknown as SearchService;

    const service = new DuplicateService(mockSearchService, {} as EntryService);
    const duplicates = await service.findDuplicatesForText({
      text: 'Test project summary',
      category: 'projects'
    });

    expect(duplicates.length).toBe(1);
    expect(duplicates[0].reason).toBe('semantic_similarity');
  });

  it('should return duplicates based on name similarity', async () => {
    const mockSearchService = {
      search: jest.fn().mockResolvedValue({
        entries: [
          {
            path: 'ideas/test-idea',
            name: 'Test Idea',
            category: 'ideas',
            matchedField: 'name',
            snippet: 'Test Idea',
            semanticScore: 0.2
          }
        ],
        total: 1
      })
    } as unknown as SearchService;

    const service = new DuplicateService(mockSearchService, {} as EntryService);
    const duplicates = await service.findDuplicatesForText({
      name: 'Test Idea',
      category: 'ideas'
    });

    expect(duplicates.length).toBe(1);
    expect(duplicates[0].reason).toBe('name_similarity');
  });
});

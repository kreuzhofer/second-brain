import request from 'supertest';
import express from 'express';
import { resetDatabase } from '../setup';
import { authMiddleware } from '../../src/middleware/auth';
import { searchRouter } from '../../src/routes/search';
import { entriesRouter } from '../../src/routes/entries';
import { EntryService } from '../../src/services/entry.service';
import { resetSearchService } from '../../src/services/search.service';

const TEST_API_KEY = 'test-api-key-12345';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    API_KEY: 'test-api-key-12345',
    DATA_PATH: '/memory',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain'
  }),
  loadEnvConfig: () => ({
    API_KEY: 'test-api-key-12345',
    DATA_PATH: '/memory',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain'
  })
}));

describe('Search API Integration Tests', () => {
  let app: express.Application;
  let entryService: EntryService;

  beforeAll(async () => {
    process.env.SEMANTIC_SEARCH_ENABLED = 'false';
    await resetDatabase();
    entryService = new EntryService();
  });

  beforeEach(async () => {
    resetSearchService();
    await resetDatabase();
    app = express();
    app.use(express.json());
    app.use('/api/entries', authMiddleware, entriesRouter);
    app.use('/api/search', authMiddleware, searchRouter);
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('should return search results for valid query', async () => {
    await entryService.create('projects', {
      name: 'Search API Project',
      next_action: 'Test search endpoint',
      source_channel: 'api',
      confidence: 0.9
    });

    const response = await request(app)
      .get('/api/search?query=search')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .expect(200);

    expect(response.body.entries.length).toBeGreaterThan(0);
    expect(response.body.total).toBeGreaterThan(0);
  });

  it('should return 400 for missing query', async () => {
    const response = await request(app)
      .get('/api/search')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

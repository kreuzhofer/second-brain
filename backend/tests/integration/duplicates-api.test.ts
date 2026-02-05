import request from 'supertest';
import express from 'express';
import { resetDatabase } from '../setup';
import { authMiddleware } from '../../src/middleware/auth';
import { duplicatesRouter } from '../../src/routes/duplicates';
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

describe('Duplicates API Integration Tests', () => {
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
    app.use('/api/duplicates', authMiddleware, duplicatesRouter);
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('should return duplicates for similar names', async () => {
    await entryService.create('projects', {
      name: 'Test Project',
      next_action: 'Do something',
      source_channel: 'api',
      confidence: 0.9
    });
    await entryService.create('projects', {
      name: 'Project Test',
      next_action: 'Another action',
      source_channel: 'api',
      confidence: 0.9
    });

    const response = await request(app)
      .post('/api/duplicates')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({
        name: 'Test Project',
        category: 'projects'
      })
      .expect(200);

    expect(response.body.duplicates.length).toBeGreaterThan(0);
  });
});

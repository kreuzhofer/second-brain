import request from 'supertest';
import express from 'express';
import { resetDatabase } from '../setup';
import { authMiddleware } from '../../src/middleware/auth';
import { entriesRouter } from '../../src/routes/entries';
import { EntryService, EntryNotFoundError } from '../../src/services/entry.service';

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

describe('Entries Merge API Integration Tests', () => {
  let app: express.Application;
  let entryService: EntryService;

  beforeAll(async () => {
    await resetDatabase();
    entryService = new EntryService();
  });

  beforeEach(async () => {
    await resetDatabase();
    app = express();
    app.use(express.json());
    app.use('/api/entries', authMiddleware, entriesRouter);
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('should merge source entries into target', async () => {
    const target = await entryService.create('projects', {
      name: 'Merge Target',
      next_action: 'Keep target',
      source_channel: 'api',
      confidence: 0.9
    });
    const source = await entryService.create('projects', {
      name: 'Merge Source',
      next_action: 'Source action',
      source_channel: 'api',
      confidence: 0.9
    });

    const response = await request(app)
      .post('/api/entries/merge')
      .set('Authorization', `Bearer ${TEST_API_KEY}`)
      .send({
        targetPath: target.path,
        sourcePaths: [source.path]
      })
      .expect(200);

    expect(response.body.path).toBe(target.path);

    await expect(entryService.read(source.path)).rejects.toThrow(EntryNotFoundError);
  });
});

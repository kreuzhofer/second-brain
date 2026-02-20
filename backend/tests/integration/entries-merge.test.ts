import request from 'supertest';
import express from 'express';
import { resetDatabase, createTestJwt, TEST_JWT_SECRET } from '../setup';
import { authMiddleware } from '../../src/middleware/auth';
import { entriesRouter } from '../../src/routes/entries';
import { EntryService, EntryNotFoundError } from '../../src/services/entry.service';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: 'test@example.com',
    DEFAULT_USER_PASSWORD: 'test-password-123',
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/justdo'
  }),
  loadEnvConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: 'test@example.com',
    DEFAULT_USER_PASSWORD: 'test-password-123',
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/justdo'
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

    const token = createTestJwt();
    const response = await request(app)
      .post('/api/entries/merge')
      .set('Authorization', `Bearer ${token}`)
      .send({
        targetPath: target.path,
        sourcePaths: [source.path]
      })
      .expect(200);

    expect(response.body.path).toBe(target.path);

    await expect(entryService.read(source.path)).rejects.toThrow(EntryNotFoundError);
  });
});

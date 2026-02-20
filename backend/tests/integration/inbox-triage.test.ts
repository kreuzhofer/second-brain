import request from 'supertest';
import express from 'express';
import { resetDatabase, createTestJwt, TEST_JWT_SECRET } from '../setup';
import { authMiddleware } from '../../src/middleware/auth';
import { inboxRouter } from '../../src/routes/inbox';
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

describe('Inbox Triage API Integration Tests', () => {
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
    app.use('/api/inbox', authMiddleware, inboxRouter);
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('should move inbox entries to a target category', async () => {
    const inboxEntry = await entryService.create('inbox', {
      original_text: 'Follow up with Alex about contract',
      suggested_category: 'projects',
      suggested_name: 'Alex Contract',
      confidence: 0.4,
      source_channel: 'api'
    });

    const token = createTestJwt();
    const response = await request(app)
      .post('/api/inbox/triage')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'move',
        paths: [inboxEntry.path],
        targetCategory: 'projects'
      })
      .expect(200);

    expect(response.body.entries.length).toBe(1);
    expect(response.body.entries[0].category).toBe('projects');
  });

  it('should resolve (delete) inbox entries', async () => {
    const inboxEntry = await entryService.create('inbox', {
      original_text: 'Delete this inbox item',
      suggested_category: 'admin',
      suggested_name: 'Disposable',
      confidence: 0.3,
      source_channel: 'api'
    });

    const token = createTestJwt();
    await request(app)
      .post('/api/inbox/triage')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'resolve',
        paths: [inboxEntry.path]
      })
      .expect(204);

    await expect(entryService.read(inboxEntry.path)).rejects.toThrow(EntryNotFoundError);
  });

  it('should merge inbox entries into a target entry', async () => {
    const target = await entryService.create('projects', {
      name: 'Merge Target',
      next_action: 'Review inputs',
      source_channel: 'api',
      confidence: 0.9
    });

    const inboxEntry = await entryService.create('inbox', {
      original_text: 'Merge this into target notes',
      suggested_category: 'projects',
      suggested_name: 'Merge Note',
      confidence: 0.4,
      source_channel: 'api'
    });

    const token = createTestJwt();
    const response = await request(app)
      .post('/api/inbox/triage')
      .set('Authorization', `Bearer ${token}`)
      .send({
        action: 'merge',
        paths: [inboxEntry.path],
        targetPath: target.path
      })
      .expect(200);

    expect(response.body.entry.path).toBe(target.path);
    const updated = await entryService.read(target.path);
    expect(updated.content).toContain('Inbox Merge');
    expect(updated.content).toContain('Merge this into target notes');
  });
});

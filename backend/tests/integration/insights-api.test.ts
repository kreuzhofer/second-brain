import request from 'supertest';
import express from 'express';
import { resetDatabase, createTestJwt, TEST_JWT_SECRET } from '../setup';
import { entriesRouter } from '../../src/routes/entries';
import { insightsRouter } from '../../src/routes/insights';
import { authMiddleware } from '../../src/middleware/auth';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: 'test@example.com',
    DEFAULT_USER_PASSWORD: 'test-password-123',
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain'
  }),
  loadEnvConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: 'test@example.com',
    DEFAULT_USER_PASSWORD: 'test-password-123',
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain'
  })
}));

describe('Insights API Integration Tests', () => {
  let app: express.Application;
  let authToken: string;

  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    app = express();
    app.use(express.json());
    app.use('/api/entries', authMiddleware, entriesRouter);
    app.use('/api/insights', authMiddleware, insightsRouter);
    authToken = createTestJwt();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('returns relationship insights from existing links', async () => {
    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'people',
        name: 'Chris',
        context: 'Video editor',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'people',
        name: 'Amie',
        context: 'Operations lead',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'projects',
        name: 'Retail Demo One Pagers',
        next_action: 'Draft first version',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'admin',
        name: 'Call Chris',
        status: 'pending',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    await request(app)
      .post('/api/entries/people/chris/links')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetPath: 'people/amie', type: 'relationship' })
      .expect(201);

    await request(app)
      .post('/api/entries/people/amie/links')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetPath: 'people/chris', type: 'relationship' })
      .expect(201);

    await request(app)
      .post('/api/entries/projects/retail-demo-one-pagers/links')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetPath: 'people/chris', type: 'mention' })
      .expect(201);

    await request(app)
      .post('/api/entries/admin/call-chris/links')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ targetPath: 'people/chris', type: 'mention' })
      .expect(201);

    const response = await request(app)
      .get('/api/insights/relationships?limit=2')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(Array.isArray(response.body.insights)).toBe(true);
    expect(response.body.insights).toHaveLength(2);
    expect(response.body.insights[0]).toEqual(
      expect.objectContaining({
        person: expect.objectContaining({
          path: 'people/chris',
          name: 'Chris'
        }),
        relationshipCount: 1,
        projectCount: 1
      })
    );
    expect(response.body.insights[0].relatedPeople).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'people/amie'
        })
      ])
    );
    expect(response.body.insights[0].relatedProjects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'projects/retail-demo-one-pagers'
        })
      ])
    );
  });

  it('validates limit query parameter', async () => {
    const response = await request(app)
      .get('/api/insights/relationships?limit=0')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });
});

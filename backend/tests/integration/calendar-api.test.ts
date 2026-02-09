import request from 'supertest';
import express from 'express';
import { resetDatabase, createTestJwt, TEST_JWT_SECRET } from '../setup';
import { entriesRouter } from '../../src/routes/entries';
import { calendarRouter, calendarPublicRouter } from '../../src/routes/calendar';
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

describe('Calendar API Integration Tests', () => {
  let app: express.Application;
  let authToken: string;

  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    app = express();
    app.use(express.json());
    app.use('/api/calendar', calendarPublicRouter);
    app.use('/api/calendar', authMiddleware, calendarRouter);
    app.use('/api/entries', authMiddleware, entriesRouter);
    authToken = createTestJwt();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  it('returns a week plan from active tasks', async () => {
    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Draft retail demo one pager',
        status: 'pending',
        due_date: '2026-02-12',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const response = await request(app)
      .get('/api/calendar/plan-week?startDate=2026-02-09')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.startDate).toBe('2026-02-09');
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items[0]).toEqual(
      expect.objectContaining({
        entryPath: 'task/draft-retail-demo-one-pager',
        title: expect.any(String),
        start: expect.any(String),
        end: expect.any(String)
      })
    );
  });

  it('returns publish URLs and serves feed as ICS', async () => {
    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Finalize partner update',
        status: 'pending',
        due_date: '2026-02-13',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const publishResponse = await request(app)
      .get('/api/calendar/publish')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(publishResponse.body).toEqual(
      expect.objectContaining({
        httpsUrl: expect.stringContaining('/api/calendar/feed.ics?token='),
        webcalUrl: expect.stringContaining('webcal://')
      })
    );

    const token = new URL(publishResponse.body.httpsUrl).searchParams.get('token');
    expect(token).toBeTruthy();

    const feedResponse = await request(app)
      .get(`/api/calendar/feed.ics?token=${encodeURIComponent(token as string)}`)
      .expect(200);

    expect(feedResponse.headers['content-type']).toContain('text/calendar');
    expect(feedResponse.text).toContain('BEGIN:VCALENDAR');
    expect(feedResponse.text).toContain('SUMMARY:Finalize partner update');
  });
});

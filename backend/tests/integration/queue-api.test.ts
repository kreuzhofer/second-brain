import request from 'supertest';
import express from 'express';
import { authMiddleware } from '../../src/middleware/auth';
import { queueRouter } from '../../src/routes/queue';
import { resetDatabase } from '../setup';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    API_KEY: 'test-api-key-12345',
    DATA_PATH: '/tmp/second-brain-queue-test',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain',
    OFFLINE_QUEUE_ENABLED: true,
    OFFLINE_QUEUE_REPLAY_INTERVAL_SEC: 60,
    OFFLINE_QUEUE_PROCESSING_TIMEOUT_SEC: 300,
    OFFLINE_QUEUE_RETRY_BASE_SEC: 30,
    OFFLINE_QUEUE_MAX_ATTEMPTS: 6,
    OFFLINE_QUEUE_DEDUPE_TTL_HOURS: 24
  }),
  loadEnvConfig: () => ({
    API_KEY: 'test-api-key-12345',
    DATA_PATH: '/tmp/second-brain-queue-test',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain',
    OFFLINE_QUEUE_ENABLED: true,
    OFFLINE_QUEUE_REPLAY_INTERVAL_SEC: 60,
    OFFLINE_QUEUE_PROCESSING_TIMEOUT_SEC: 300,
    OFFLINE_QUEUE_RETRY_BASE_SEC: 30,
    OFFLINE_QUEUE_MAX_ATTEMPTS: 6,
    OFFLINE_QUEUE_DEDUPE_TTL_HOURS: 24
  })
}));

describe('Offline Queue API Integration Tests', () => {
  let app: express.Application;

  beforeEach(async () => {
    await resetDatabase();
    app = express();
    app.use(express.json());
    app.use('/api/queue', authMiddleware, queueRouter);
  });

  it('should return queue status', async () => {
    const response = await request(app)
      .get('/api/queue/status')
      .set('Authorization', 'Bearer test-api-key-12345')
      .expect(200);

    expect(response.body).toHaveProperty('pending');
    expect(response.body).toHaveProperty('processing');
    expect(response.body).toHaveProperty('failed');
  });

  it('should return failed queue items', async () => {
    const response = await request(app)
      .get('/api/queue/failed')
      .set('Authorization', 'Bearer test-api-key-12345')
      .expect(200);

    expect(response.body).toHaveProperty('failed');
    expect(Array.isArray(response.body.failed)).toBe(true);
  });
});

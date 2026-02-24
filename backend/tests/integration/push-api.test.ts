/**
 * Push API Integration Tests
 * Tests subscription CRUD routes and status endpoint.
 */

import request from 'supertest';
import express from 'express';
import { resetDatabase, createTestJwt, TEST_JWT_SECRET, TEST_USER_ID } from '../setup';
import { pushRouter } from '../../src/routes/push';
import { authMiddleware } from '../../src/middleware/auth';
import { getPrismaClient } from '../../src/lib/prisma';

const TEST_VAPID_PUBLIC_KEY = 'BNBblzG_test_key_for_unit_testing_only_1234567890abcdef';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: 'test@example.com',
    DEFAULT_USER_PASSWORD: 'test-password-123',
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain',
    VAPID_PUBLIC_KEY: TEST_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: 'test-private-key-for-unit-testing',
    VAPID_SUBJECT: 'mailto:test@example.com'
  }),
  loadEnvConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: 'test@example.com',
    DEFAULT_USER_PASSWORD: 'test-password-123',
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain',
    VAPID_PUBLIC_KEY: TEST_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: 'test-private-key-for-unit-testing',
    VAPID_SUBJECT: 'mailto:test@example.com'
  })
}));

describe('Push API Integration Tests', () => {
  let app: express.Application;
  let authToken: string;
  const prisma = getPrismaClient();

  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    app = express();
    app.use(express.json());
    app.use('/api/push', authMiddleware, pushRouter);
    authToken = createTestJwt();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  describe('GET /api/push/vapid-key', () => {
    it('returns the VAPID public key', async () => {
      const res = await request(app)
        .get('/api/push/vapid-key')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.publicKey).toBe(TEST_VAPID_PUBLIC_KEY);
    });

    it('requires authentication', async () => {
      await request(app).get('/api/push/vapid-key').expect(401);
    });
  });

  describe('POST /api/push/subscribe', () => {
    it('creates a push subscription', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-1',
          keys: { p256dh: 'test-p256dh-key', auth: 'test-auth-key' }
        })
        .expect(201);

      expect(res.body.subscribed).toBe(true);

      // Verify in database
      const sub = await prisma.pushSubscription.findFirst({
        where: { userId: TEST_USER_ID }
      });
      expect(sub).not.toBeNull();
      expect(sub!.endpoint).toBe(
        'https://fcm.googleapis.com/fcm/send/test-endpoint-1'
      );
      expect(sub!.p256dh).toBe('test-p256dh-key');
      expect(sub!.auth).toBe('test-auth-key');
    });

    it('returns 400 if endpoint missing', async () => {
      const res = await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ keys: { p256dh: 'x', auth: 'y' } })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 if keys missing', async () => {
      await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ endpoint: 'https://example.com/push' })
        .expect(400);
    });

    it('returns 400 if keys.auth missing', async () => {
      await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          endpoint: 'https://example.com/push',
          keys: { p256dh: 'x' }
        })
        .expect(400);
    });

    it('upserts on duplicate endpoint', async () => {
      const sub = {
        endpoint: 'https://fcm.googleapis.com/test-upsert',
        keys: { p256dh: 'key1', auth: 'auth1' }
      };

      await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send(sub)
        .expect(201);

      // Re-subscribe with updated keys
      await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          ...sub,
          keys: { p256dh: 'key2', auth: 'auth2' }
        })
        .expect(201);

      // Should still be one record
      const count = await prisma.pushSubscription.count({
        where: { userId: TEST_USER_ID }
      });
      expect(count).toBe(1);

      // Keys should be updated
      const updated = await prisma.pushSubscription.findFirst({
        where: { userId: TEST_USER_ID }
      });
      expect(updated!.p256dh).toBe('key2');
      expect(updated!.auth).toBe('auth2');
    });
  });

  describe('POST /api/push/unsubscribe', () => {
    it('removes an existing subscription', async () => {
      // First subscribe
      await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/test-unsub',
          keys: { p256dh: 'p', auth: 'a' }
        })
        .expect(201);

      // Then unsubscribe
      const res = await request(app)
        .post('/api/push/unsubscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ endpoint: 'https://fcm.googleapis.com/test-unsub' })
        .expect(200);

      expect(res.body.removed).toBe(true);

      // Verify removed
      const count = await prisma.pushSubscription.count({
        where: { userId: TEST_USER_ID }
      });
      expect(count).toBe(0);
    });

    it('returns removed=false for non-existent endpoint', async () => {
      const res = await request(app)
        .post('/api/push/unsubscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ endpoint: 'https://fcm.googleapis.com/nonexistent' })
        .expect(200);

      expect(res.body.removed).toBe(false);
    });

    it('returns 400 if endpoint missing', async () => {
      await request(app)
        .post('/api/push/unsubscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/push/status', () => {
    it('returns enabled=true and subscriptionCount=0 initially', async () => {
      const res = await request(app)
        .get('/api/push/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.enabled).toBe(true);
      expect(res.body.subscriptionCount).toBe(0);
    });

    it('returns subscriptionCount=1 after subscribing', async () => {
      await request(app)
        .post('/api/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          endpoint: 'https://fcm.googleapis.com/test-status',
          keys: { p256dh: 'p', auth: 'a' }
        })
        .expect(201);

      const res = await request(app)
        .get('/api/push/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.enabled).toBe(true);
      expect(res.body.subscriptionCount).toBe(1);
    });
  });
});

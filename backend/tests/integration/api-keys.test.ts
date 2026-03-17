/**
 * API Keys Integration Tests
 * Tests CRUD routes for agent API key management.
 */

import request from 'supertest';
import express from 'express';
import { resetDatabase, createTestJwt, TEST_JWT_SECRET, TEST_USER_ID } from '../setup';
import { apiKeysRouter } from '../../src/routes/api-keys';
import { authMiddleware } from '../../src/middleware/auth';
import { getPrismaClient } from '../../src/lib/prisma';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: 'test@example.com',
    DEFAULT_USER_PASSWORD: 'test-password-123',
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain',
  }),
  loadEnvConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: 'test@example.com',
    DEFAULT_USER_PASSWORD: 'test-password-123',
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain',
  }),
}));

describe('API Keys Integration Tests', () => {
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
    app.use('/api/api-keys', authMiddleware, apiKeysRouter);
    authToken = createTestJwt();
  });

  afterAll(async () => {
    await resetDatabase();
  });

  describe('POST /api/api-keys', () => {
    it('creates a key and returns the full key with prefix', async () => {
      const res = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: 'test-agent' })
        .expect(201);

      expect(res.body.key).toBeDefined();
      expect(res.body.key).toHaveLength(64); // 32 bytes hex
      expect(res.body.id).toBeDefined();
      expect(res.body.keyPrefix).toBe(res.body.key.slice(0, 8));
      expect(res.body.agentName).toBe('test-agent');
    });

    it('stores the key hash in the database (not the raw key)', async () => {
      const res = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: 'hash-check-agent' })
        .expect(201);

      const record = await prisma.agentApiKey.findUnique({
        where: { id: res.body.id },
      });
      expect(record).not.toBeNull();
      expect(record!.keyHash).toBeDefined();
      expect(record!.keyHash).not.toBe(res.body.key);
      expect(record!.keyPrefix).toBe(res.body.key.slice(0, 8));
    });

    it('accepts optional permissions and expiresAt', async () => {
      const expiresAt = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          agentName: 'perm-agent',
          permissions: ['read', 'write'],
          expiresAt,
        })
        .expect(201);

      const record = await prisma.agentApiKey.findUnique({
        where: { id: res.body.id },
      });
      expect(record!.permissions).toEqual(['read', 'write']);
      expect(record!.expiresAt).not.toBeNull();
    });

    it('returns 400 when agentName is missing', async () => {
      const res = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when agentName is empty', async () => {
      const res = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: '' })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 when agentName exceeds 100 characters', async () => {
      const res = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: 'a'.repeat(101) })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('requires authentication', async () => {
      await request(app)
        .post('/api/api-keys')
        .send({ agentName: 'no-auth' })
        .expect(401);
    });
  });

  describe('GET /api/api-keys', () => {
    it('lists keys without hashes', async () => {
      // Create two keys
      await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: 'agent-1' })
        .expect(201);

      await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: 'agent-2' })
        .expect(201);

      const res = await request(app)
        .get('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.keys).toHaveLength(2);
      for (const key of res.body.keys) {
        expect(key.id).toBeDefined();
        expect(key.keyPrefix).toBeDefined();
        expect(key.agentName).toBeDefined();
        expect(key.permissions).toBeDefined();
        expect(key.createdAt).toBeDefined();
        // Must never return the hash or raw key
        expect(key.keyHash).toBeUndefined();
        expect(key.key).toBeUndefined();
      }
    });

    it('returns empty array when no keys exist', async () => {
      const res = await request(app)
        .get('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.keys).toEqual([]);
    });

    it('requires authentication', async () => {
      await request(app).get('/api/api-keys').expect(401);
    });
  });

  describe('POST /api/api-keys/:id/revoke', () => {
    it('sets revokedAt on the key', async () => {
      const createRes = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: 'revoke-me' })
        .expect(201);

      await request(app)
        .post(`/api/api-keys/${createRes.body.id}/revoke`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const record = await prisma.agentApiKey.findUnique({
        where: { id: createRes.body.id },
      });
      expect(record!.revokedAt).not.toBeNull();
    });

    it('revoked key appears in list with revokedAt set', async () => {
      const createRes = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: 'list-revoked' })
        .expect(201);

      await request(app)
        .post(`/api/api-keys/${createRes.body.id}/revoke`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const listRes = await request(app)
        .get('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const revokedKey = listRes.body.keys.find(
        (k: { id: string }) => k.id === createRes.body.id
      );
      expect(revokedKey).toBeDefined();
      expect(revokedKey.revokedAt).not.toBeNull();
    });

    it('returns 404 for non-existent key', async () => {
      const res = await request(app)
        .post('/api/api-keys/00000000-0000-4000-8000-000000000099/revoke')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when revoking another user\'s key', async () => {
      // Create key as test user
      const createRes = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: 'other-user-key' })
        .expect(201);

      // Create a second user
      const otherEmail = 'other-revoke@example.com';
      const otherUser = await prisma.user.upsert({
        where: { email: otherEmail },
        create: {
          email: otherEmail,
          name: 'Other User',
          passwordHash: 'not-used',
        },
        update: {},
      });

      const otherToken = createTestJwt(otherUser.id, otherEmail);

      // Try to revoke as other user
      await request(app)
        .post(`/api/api-keys/${createRes.body.id}/revoke`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });
  });

  describe('DELETE /api/api-keys/:id', () => {
    it('removes the key from the database', async () => {
      const createRes = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: 'delete-me' })
        .expect(201);

      await request(app)
        .delete(`/api/api-keys/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const record = await prisma.agentApiKey.findUnique({
        where: { id: createRes.body.id },
      });
      expect(record).toBeNull();
    });

    it('deleted key no longer appears in list', async () => {
      const createRes = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: 'list-deleted' })
        .expect(201);

      await request(app)
        .delete(`/api/api-keys/${createRes.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      const listRes = await request(app)
        .get('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(listRes.body.keys).toHaveLength(0);
    });

    it('returns 404 for non-existent key', async () => {
      const res = await request(app)
        .delete('/api/api-keys/00000000-0000-4000-8000-000000000099')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('returns 404 when deleting another user\'s key', async () => {
      // Create key as test user
      const createRes = await request(app)
        .post('/api/api-keys')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ agentName: 'other-user-delete' })
        .expect(201);

      // Create a second user
      const otherEmail = 'other-delete@example.com';
      const otherUser = await prisma.user.upsert({
        where: { email: otherEmail },
        create: {
          email: otherEmail,
          name: 'Other User',
          passwordHash: 'not-used',
        },
        update: {},
      });

      const otherToken = createTestJwt(otherUser.id, otherEmail);

      // Try to delete as other user
      await request(app)
        .delete(`/api/api-keys/${createRes.body.id}`)
        .set('Authorization', `Bearer ${otherToken}`)
        .expect(404);
    });
  });
});

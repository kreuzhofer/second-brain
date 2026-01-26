/**
 * Property Tests: API Authentication
 * 
 * Property 17: API Authentication Enforcement
 * For any request to /api/chat, /api/conversations, or /api/conversations/:id/messages
 * without a valid Bearer token, the API SHALL return a 401 Unauthorized response.
 * 
 * **Validates: Requirements 12.5**
 */

import * as fc from 'fast-check';
import request from 'supertest';
import express from 'express';
import { authMiddleware } from '../../src/middleware/auth';
import { chatRouter } from '../../src/routes/chat';

// Create a test app with auth middleware
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/chat', authMiddleware, chatRouter);
  return app;
};

describe('Property Tests: API Authentication', () => {
  /**
   * Property 17: API Authentication Enforcement
   * 
   * For any request to /api/chat, /api/conversations, or /api/conversations/:id/messages
   * without a valid Bearer token, the API SHALL return a 401 Unauthorized response.
   * 
   * **Validates: Requirements 12.5**
   */
  describe('Property 17: API Authentication Enforcement', () => {
    const app = createTestApp();

    // Protected endpoints to test
    const protectedEndpoints = [
      { method: 'post' as const, path: '/api/chat', body: { message: 'test' } },
      { method: 'get' as const, path: '/api/chat/conversations', body: undefined },
      { method: 'get' as const, path: '/api/chat/conversations/test-id/messages', body: undefined },
      { method: 'get' as const, path: '/api/chat/conversations/test-id', body: undefined },
    ];

    it('returns 401 for requests without Authorization header', async () => {
      for (const endpoint of protectedEndpoints) {
        const req = endpoint.method === 'post'
          ? request(app).post(endpoint.path).send(endpoint.body)
          : request(app).get(endpoint.path);

        const response = await req;
        expect(response.status).toBe(401);
        expect(response.body.error.code).toBe('UNAUTHORIZED');
      }
    });

    it('returns 401 for requests with invalid Authorization format', async () => {
      const invalidAuthValues = ['', 'Basic token', 'Token abc', 'bearer token', 'BEARER token'];
      
      for (const invalidAuth of invalidAuthValues) {
        for (const endpoint of protectedEndpoints) {
          const req = endpoint.method === 'post'
            ? request(app).post(endpoint.path).set('Authorization', invalidAuth).send(endpoint.body)
            : request(app).get(endpoint.path).set('Authorization', invalidAuth);

          const response = await req;
          expect(response.status).toBe(401);
        }
      }
    });

    it('returns 401 for requests with wrong Bearer token', async () => {
      const wrongTokens = ['wrong-token', 'invalid', '12345', 'test-token-wrong'];
      
      for (const wrongToken of wrongTokens) {
        // Skip if it happens to match the actual token
        if (wrongToken === process.env.API_TOKEN) continue;
        
        for (const endpoint of protectedEndpoints) {
          const req = endpoint.method === 'post'
            ? request(app).post(endpoint.path).set('Authorization', `Bearer ${wrongToken}`).send(endpoint.body)
            : request(app).get(endpoint.path).set('Authorization', `Bearer ${wrongToken}`);

          const response = await req;
          expect(response.status).toBe(401);
        }
      }
    });

    it('returns 401 for requests with empty Bearer token', async () => {
      for (const endpoint of protectedEndpoints) {
        const req = endpoint.method === 'post'
          ? request(app).post(endpoint.path).set('Authorization', 'Bearer ').send(endpoint.body)
          : request(app).get(endpoint.path).set('Authorization', 'Bearer ');

        const response = await req;
        expect(response.status).toBe(401);
      }
    });

    it('allows requests with valid Bearer token', async () => {
      const validToken = process.env.API_TOKEN;
      if (!validToken) {
        console.warn('API_TOKEN not set, skipping valid token test');
        return;
      }

      // POST /api/chat should not return 401 with valid token
      // (it may return other errors due to missing services, but not 401)
      const response = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ message: 'test' });

      expect(response.status).not.toBe(401);
    });
  });
});

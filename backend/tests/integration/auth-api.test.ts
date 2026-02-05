import request from 'supertest';
import express from 'express';
import { resetDatabase, createTestJwt, TEST_JWT_SECRET, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../setup';
import { authRouter } from '../../src/routes/auth';
import { getPrismaClient } from '../../src/lib/prisma';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: 'test@example.com',
    DEFAULT_USER_PASSWORD: 'test-password-123',
    DEFAULT_USER_NAME: 'Test User',
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain'
  }),
  loadEnvConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: 'test@example.com',
    DEFAULT_USER_PASSWORD: 'test-password-123',
    DEFAULT_USER_NAME: 'Test User',
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain'
  })
}));

describe('Auth API Integration Tests', () => {
  let app: express.Application;

  beforeEach(async () => {
    await resetDatabase();
    await getPrismaClient().user.deleteMany({ where: { email: 'new@example.com' } });
    app = express();
    app.use(express.json());
    app.use('/api/auth', authRouter);
  });

  it('registers a new user', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        email: 'new@example.com',
        password: 'strong-pass-123',
        name: 'New User'
      })
      .expect(200);

    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe('new@example.com');
    expect(response.body.user.name).toBe('New User');
  });

  it('returns 400 for invalid email', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'invalid-email', password: 'strong-pass-123' })
      .expect(400);

    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('logs in existing user', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER_EMAIL, password: TEST_USER_PASSWORD })
      .expect(200);

    expect(response.body.token).toBeDefined();
    expect(response.body.user.email).toBe(TEST_USER_EMAIL);
  });

  it('returns 401 for invalid login', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER_EMAIL, password: 'wrong-password' })
      .expect(401);

    expect(response.body.error.code).toBe('UNAUTHORIZED');
  });

  it('returns current user from /me', async () => {
    const token = createTestJwt();
    const response = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.email).toBe(TEST_USER_EMAIL);
  });
});

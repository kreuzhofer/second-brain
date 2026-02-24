import request from 'supertest';
import express from 'express';
import { resetDatabase, createTestJwt, TEST_JWT_SECRET, TEST_USER_ID, TEST_USER_EMAIL, TEST_USER_PASSWORD } from '../setup';
import { authRouter } from '../../src/routes/auth';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: TEST_USER_EMAIL,
    DEFAULT_USER_PASSWORD: TEST_USER_PASSWORD,
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/justdo'
  }),
  loadEnvConfig: () => ({
    JWT_SECRET: TEST_JWT_SECRET,
    DEFAULT_USER_EMAIL: TEST_USER_EMAIL,
    DEFAULT_USER_PASSWORD: TEST_USER_PASSWORD,
    JWT_EXPIRES_IN: '1h',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/justdo'
  })
}));

const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

const authToken = createTestJwt(TEST_USER_ID, TEST_USER_EMAIL);

beforeEach(async () => {
  await resetDatabase();
});

describe('PATCH /api/auth/profile', () => {
  it('updates the display name', async () => {
    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'New Name' })
      .expect(200);

    expect(res.body.name).toBe('New Name');
    expect(res.body.email).toBe(TEST_USER_EMAIL);
  });

  it('trims whitespace from name', async () => {
    const res = await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '  Trimmed  ' })
      .expect(200);

    expect(res.body.name).toBe('Trimmed');
  });

  it('rejects empty name', async () => {
    await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: '' })
      .expect(400);
  });

  it('rejects missing name', async () => {
    await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({})
      .expect(400);
  });

  it('rejects name over 100 characters', async () => {
    await request(app)
      .patch('/api/auth/profile')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ name: 'a'.repeat(101) })
      .expect(400);
  });

  it('returns 401 without auth', async () => {
    await request(app)
      .patch('/api/auth/profile')
      .send({ name: 'Test' })
      .expect(401);
  });
});

describe('PATCH /api/auth/email', () => {
  it('updates email with correct password', async () => {
    const res = await request(app)
      .patch('/api/auth/email')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ email: 'new@example.com', password: TEST_USER_PASSWORD })
      .expect(200);

    expect(res.body.email).toBe('new@example.com');
  });

  it('returns 401 with wrong password', async () => {
    const res = await request(app)
      .patch('/api/auth/email')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ email: 'new@example.com', password: 'wrong-password' })
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects invalid email format', async () => {
    await request(app)
      .patch('/api/auth/email')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ email: 'not-an-email', password: TEST_USER_PASSWORD })
      .expect(400);
  });

  it('rejects missing fields', async () => {
    await request(app)
      .patch('/api/auth/email')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ email: 'new@example.com' })
      .expect(400);
  });

  it('returns 409 for duplicate email', async () => {
    // Register a second user first
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'other@example.com', password: 'password123' });

    const res = await request(app)
      .patch('/api/auth/email')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ email: 'other@example.com', password: TEST_USER_PASSWORD })
      .expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 401 without auth', async () => {
    await request(app)
      .patch('/api/auth/email')
      .send({ email: 'new@example.com', password: 'test' })
      .expect(401);
  });
});

describe('PATCH /api/auth/password', () => {
  it('changes password with correct current password', async () => {
    await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ currentPassword: TEST_USER_PASSWORD, newPassword: 'new-password-123' })
      .expect(204);

    // Verify new password works for login
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: TEST_USER_EMAIL, password: 'new-password-123' })
      .expect(200);

    expect(loginRes.body.token).toBeTruthy();
  });

  it('returns 401 with wrong current password', async () => {
    const res = await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ currentPassword: 'wrong-password', newPassword: 'new-password-123' })
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('rejects new password shorter than 8 characters', async () => {
    await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ currentPassword: TEST_USER_PASSWORD, newPassword: 'short' })
      .expect(400);
  });

  it('rejects missing fields', async () => {
    await request(app)
      .patch('/api/auth/password')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ currentPassword: TEST_USER_PASSWORD })
      .expect(400);
  });

  it('returns 401 without auth', async () => {
    await request(app)
      .patch('/api/auth/password')
      .send({ currentPassword: 'test', newPassword: 'new-password-123' })
      .expect(401);
  });
});

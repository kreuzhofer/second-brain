import request from 'supertest';
import express from 'express';
import { resetDatabase } from '../setup';
import { entriesRouter } from '../../src/routes/entries';
import { healthRouter } from '../../src/routes/health';
import { indexRouter } from '../../src/routes/index-route';
import { authMiddleware } from '../../src/middleware/auth';
const TEST_API_KEY = 'test-api-key-12345';

// Mock the config module
jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    API_KEY: 'test-api-key-12345',
    DATA_PATH: '/memory',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain'
  }),
  loadEnvConfig: () => ({
    API_KEY: 'test-api-key-12345',
    DATA_PATH: '/memory',
    OPENAI_API_KEY: '',
    DATABASE_URL: process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/second-brain'
  })
}));

describe('API Integration Tests', () => {
  let app: express.Application;

  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    // Create fresh Express app for each test
    app = express();
    app.use(express.json());
    app.use('/api/health', healthRouter);
    app.use('/api/entries', authMiddleware, entriesRouter);
    app.use('/api/index', authMiddleware, indexRouter);
  });

  afterAll(async () => {
    await resetDatabase();
  });

  describe('GET /api/health', () => {
    it('should return 200 OK without authentication', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body.status).toBe('ok');
      expect(response.body.service).toBe('second-brain-api');
    });
  });

  describe('Authentication', () => {
    it('should return 401 without authorization header', async () => {
      const response = await request(app)
        .get('/api/entries')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/api/entries')
        .set('Authorization', 'Bearer wrong-token')
        .expect(401);

      expect(response.body.error.code).toBe('UNAUTHORIZED');
    });

    it('should allow request with valid token', async () => {
      const response = await request(app)
        .get('/api/entries')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(response.body.entries).toBeDefined();
    });
  });

  describe('POST /api/entries', () => {
    it('should create a people entry', async () => {
      const response = await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          category: 'people',
          name: 'API Test Person',
          context: 'Created via API test',
          source_channel: 'api',
          confidence: 0.9
        })
        .expect(201);

      expect(response.body.path).toBe('people/api-test-person.md');
      expect(response.body.entry.name).toBe('API Test Person');
    });

    it('should create a projects entry', async () => {
      const response = await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          category: 'projects',
          name: 'API Test Project',
          next_action: 'Test the API',
          source_channel: 'api',
          confidence: 0.85
        })
        .expect(201);

      expect(response.body.path).toBe('projects/api-test-project.md');
      expect(response.body.entry.status).toBe('active');
    });

    it('should return 400 for missing category', async () => {
      const response = await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          name: 'No Category'
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid category', async () => {
      const response = await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          category: 'invalid',
          name: 'Test'
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing name', async () => {
      const response = await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          category: 'people',
          context: 'No name provided'
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/entries', () => {
    it('should list all entries', async () => {
      const response = await request(app)
        .get('/api/entries')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(Array.isArray(response.body.entries)).toBe(true);
    });

    it('should filter by category', async () => {
      const response = await request(app)
        .get('/api/entries?category=people')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(response.body.entries.every((e: any) => e.category === 'people')).toBe(true);
    });

    it('should return 400 for invalid category', async () => {
      const response = await request(app)
        .get('/api/entries?category=invalid')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/entries/:path', () => {
    it('should get a single entry', async () => {
      // First create an entry
      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          category: 'ideas',
          name: 'Get Test Idea',
          one_liner: 'Test idea for GET',
          source_channel: 'api',
          confidence: 0.95
        });

      const response = await request(app)
        .get('/api/entries/ideas/get-test-idea.md')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(response.body.entry.name).toBe('Get Test Idea');
    });

    it('should return 404 for non-existent entry', async () => {
      const response = await request(app)
        .get('/api/entries/people/non-existent.md')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /api/entries/:path', () => {
    it('should update an entry', async () => {
      // First create an entry
      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          category: 'admin',
          name: 'Update Test Task',
          status: 'pending',
          source_channel: 'api',
          confidence: 0.99
        });

      const response = await request(app)
        .patch('/api/entries/admin/update-test-task.md')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          status: 'done'
        })
        .expect(200);

      expect(response.body.entry.status).toBe('done');
    });

    it('should return 404 for non-existent entry', async () => {
      const response = await request(app)
        .patch('/api/entries/admin/non-existent.md')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          status: 'done'
        })
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for empty update', async () => {
      const response = await request(app)
        .patch('/api/entries/admin/update-test-task.md')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /api/entries/:path', () => {
    it('should delete an entry', async () => {
      // First create an entry
      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .send({
          category: 'ideas',
          name: 'Delete Test Idea',
          one_liner: 'Will be deleted',
          source_channel: 'api',
          confidence: 0.95
        });

      await request(app)
        .delete('/api/entries/ideas/delete-test-idea.md')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(204);

      // Verify it's deleted
      await request(app)
        .get('/api/entries/ideas/delete-test-idea.md')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(404);
    });

    it('should return 404 for non-existent entry', async () => {
      const response = await request(app)
        .delete('/api/entries/ideas/non-existent.md')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/index', () => {
    it('should return index.md content', async () => {
      const response = await request(app)
        .get('/api/index')
        .set('Authorization', `Bearer ${TEST_API_KEY}`)
        .expect(200);

      expect(response.text).toContain('# Second Brain Index');
    });
  });
});

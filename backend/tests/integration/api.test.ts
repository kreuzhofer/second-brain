import request from 'supertest';
import express from 'express';
import { resetDatabase, createTestJwt, TEST_JWT_SECRET } from '../setup';
import { entriesRouter } from '../../src/routes/entries';
import { healthRouter } from '../../src/routes/health';
import { indexRouter } from '../../src/routes/index-route';
import { authMiddleware } from '../../src/middleware/auth';
import { EntryLinkService } from '../../src/services/entry-link.service';

// Mock the config module
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

describe('API Integration Tests', () => {
  let app: express.Application;
  let authToken: string;

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
    authToken = createTestJwt();
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
      expect(response.body.service).toBe('justdo-api');
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
      const token = createTestJwt();
      const response = await request(app)
        .get('/api/entries')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.entries).toBeDefined();
    });
  });

  describe('POST /api/entries', () => {
    it('should create a people entry', async () => {
      const response = await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'people',
          name: 'API Test Person',
          context: 'Created via API test',
          source_channel: 'api',
          confidence: 0.9
        })
        .expect(201);

      expect(response.body.path).toBe('people/api-test-person');
      expect(response.body.entry.name).toBe('API Test Person');
    });

    it('should create a projects entry', async () => {
      const response = await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'projects',
          name: 'API Test Project',
          next_action: 'Test the API',
          source_channel: 'api',
          confidence: 0.85
        })
        .expect(201);

      expect(response.body.path).toBe('projects/api-test-project');
      expect(response.body.entry.status).toBe('active');
    });

    it('should return 400 for missing category', async () => {
      const response = await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'No Category'
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid category', async () => {
      const response = await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
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
        .set('Authorization', `Bearer ${authToken}`)
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
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(Array.isArray(response.body.entries)).toBe(true);
    });

    it('should filter by category', async () => {
      const response = await request(app)
        .get('/api/entries?category=people')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.entries.every((e: any) => e.category === 'people')).toBe(true);
    });

    it('should return 400 for invalid category', async () => {
      const response = await request(app)
        .get('/api/entries?category=invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/entries/:path', () => {
    it('should get a single entry', async () => {
      // First create an entry
      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'ideas',
          name: 'Get Test Idea',
          one_liner: 'Test idea for GET',
          source_channel: 'api',
          confidence: 0.95
        });

      const response = await request(app)
        .get('/api/entries/ideas/get-test-idea')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.entry.name).toBe('Get Test Idea');
    });

    it('should return 404 for non-existent entry', async () => {
      const response = await request(app)
        .get('/api/entries/people/non-existent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/entries/:path/graph', () => {
    it('should return graph data with center node and links', async () => {
      const createResponse = await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'admin',
          name: 'Call Lina Haidu',
          status: 'pending',
          source_channel: 'api',
          confidence: 0.9
        })
        .expect(201);

      const linkService = new EntryLinkService();
      await linkService.linkPeopleForEntry(createResponse.body, ['Lina Haidu'], 'api');

      const graphResponse = await request(app)
        .get('/api/entries/admin/call-lina-haidu/graph')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(graphResponse.body.center.path).toBe('task/call-lina-haidu');
      expect(graphResponse.body.nodes.length).toBeGreaterThanOrEqual(2);
      expect(
        graphResponse.body.edges.some(
          (edge: any) =>
            edge.source === 'task/call-lina-haidu' &&
            edge.target === 'people/lina-haidu' &&
            edge.type === 'mention'
        )
      ).toBe(true);
    });

    it('should return 404 for non-existent graph entry', async () => {
      const response = await request(app)
        .get('/api/entries/admin/non-existent/graph')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('POST/DELETE /api/entries/:path/links', () => {
    it('should add and remove an outgoing link', async () => {
      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'admin',
          name: 'Prepare proposal draft',
          status: 'pending',
          source_channel: 'api',
          confidence: 0.9
        })
        .expect(201);

      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'people',
          name: 'Nina Weber',
          context: 'Proposal reviewer',
          follow_ups: [],
          related_projects: [],
          source_channel: 'api',
          confidence: 0.9
        })
        .expect(201);

      await request(app)
        .post('/api/entries/admin/prepare-proposal-draft/links')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetPath: 'people/nina-weber' })
        .expect(201);

      const linksAfterCreate = await request(app)
        .get('/api/entries/admin/prepare-proposal-draft/links')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(linksAfterCreate.body.outgoing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            path: 'people/nina-weber',
            category: 'people',
            name: 'Nina Weber'
          })
        ])
      );

      const removeResponse = await request(app)
        .delete('/api/entries/admin/prepare-proposal-draft/links')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetPath: 'people/nina-weber', direction: 'outgoing' })
        .expect(200);

      expect(removeResponse.body.removed).toBe(1);

      const linksAfterDelete = await request(app)
        .get('/api/entries/admin/prepare-proposal-draft/links')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(linksAfterDelete.body.outgoing).toEqual([]);
    });

    it('should remove an incoming backlink', async () => {
      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'admin',
          name: 'Book review session',
          status: 'pending',
          source_channel: 'api',
          confidence: 0.9
        })
        .expect(201);

      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'people',
          name: 'Tom Hardy',
          context: 'Stakeholder',
          follow_ups: [],
          related_projects: [],
          source_channel: 'api',
          confidence: 0.9
        })
        .expect(201);

      await request(app)
        .post('/api/entries/admin/book-review-session/links')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetPath: 'people/tom-hardy' })
        .expect(201);

      const removeIncoming = await request(app)
        .delete('/api/entries/people/tom-hardy/links')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ targetPath: 'task/book-review-session', direction: 'incoming' })
        .expect(200);

      expect(removeIncoming.body.removed).toBe(1);

      const linksToPerson = await request(app)
        .get('/api/entries/people/tom-hardy/links')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(linksToPerson.body.incoming).toEqual([]);
    });
  });

  describe('PATCH /api/entries/:path', () => {
    it('should update an entry', async () => {
      // First create an entry
      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'admin',
          name: 'Update Test Task',
          status: 'pending',
          source_channel: 'api',
          confidence: 0.99
        });

      const response = await request(app)
        .patch('/api/entries/admin/update-test-task')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'done'
        })
        .expect(200);

      expect(response.body.entry.status).toBe('done');
    });

    it('should update entry notes content', async () => {
      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'projects',
          name: 'Notes Update Project',
          next_action: 'Add notes',
          source_channel: 'api',
          confidence: 0.9
        });

      const response = await request(app)
        .patch('/api/entries/projects/notes-update-project')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          content: 'Updated notes from API test.'
        })
        .expect(200);

      expect(response.body.content).toBe('Updated notes from API test.');
    });

    it('should return 404 for non-existent entry', async () => {
      const response = await request(app)
        .patch('/api/entries/admin/non-existent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          status: 'done'
        })
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for empty update', async () => {
      const response = await request(app)
        .patch('/api/entries/admin/update-test-task')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('Task scheduling fields', () => {
    it('stores and returns duration, deadline datetime, and fixed appointment', async () => {
      const createResponse = await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'task',
          name: 'Schedule-aware task',
          status: 'pending',
          due_at: '2026-02-12T15:00:00.000Z',
          fixed_at: '2026-02-10T09:30:00.000Z',
          duration_minutes: 90,
          priority: 5,
          source_channel: 'api',
          confidence: 0.9
        })
        .expect(201);

      expect(createResponse.body.path).toBe('task/schedule-aware-task');
      expect(createResponse.body.entry.duration_minutes).toBe(90);
      expect(createResponse.body.entry.due_at).toBe('2026-02-12T15:00:00.000Z');
      expect(createResponse.body.entry.fixed_at).toBe('2026-02-10T09:30:00.000Z');
      expect(createResponse.body.entry.due_date).toBe('2026-02-12');
      expect(createResponse.body.entry.priority).toBe(5);
    });

    it('updates and clears task scheduling fields', async () => {
      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'task',
          name: 'Mutable schedule task',
          status: 'pending',
          due_date: '2026-02-12',
          fixed_at: '2026-02-10T09:30:00.000Z',
          source_channel: 'api',
          confidence: 0.9
        })
        .expect(201);

      const updated = await request(app)
        .patch('/api/entries/task/mutable-schedule-task')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          duration_minutes: 45,
          due_at: '2026-02-13T10:00:00.000Z',
          fixed_at: null,
          priority: 2
        })
        .expect(200);

      expect(updated.body.entry.duration_minutes).toBe(45);
      expect(updated.body.entry.due_at).toBe('2026-02-13T10:00:00.000Z');
      expect(updated.body.entry.fixed_at).toBeUndefined();
      expect(updated.body.entry.due_date).toBe('2026-02-13');
      expect(updated.body.entry.priority).toBe(2);
    });
  });

  describe('DELETE /api/entries/:path', () => {
    it('should delete an entry', async () => {
      // First create an entry
      await request(app)
        .post('/api/entries')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          category: 'ideas',
          name: 'Delete Test Idea',
          one_liner: 'Will be deleted',
          source_channel: 'api',
          confidence: 0.95
        });

      await request(app)
        .delete('/api/entries/ideas/delete-test-idea')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(204);

      // Verify it's deleted
      await request(app)
        .get('/api/entries/ideas/delete-test-idea')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);
    });

    it('should return 404 for non-existent entry', async () => {
      const response = await request(app)
        .delete('/api/entries/ideas/non-existent')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/index', () => {
    it('should return index.md content', async () => {
      const response = await request(app)
        .get('/api/index')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.text).toContain('# JustDo.so Index');
    });
  });
});

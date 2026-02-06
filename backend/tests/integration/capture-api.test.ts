/**
 * Integration Tests for Capture API
 */

import request from 'supertest';
import express from 'express';
import { captureRouter } from '../../src/routes/capture';

jest.mock('../../src/services/tool-executor', () => ({
  getToolExecutor: jest.fn()
}));

jest.mock('../../src/services/entry.service', () => ({
  getEntryService: jest.fn()
}));

import { getToolExecutor } from '../../src/services/tool-executor';
import { getEntryService } from '../../src/services/entry.service';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/capture', (req, res, next) => next(), captureRouter);
  return app;
};

describe('Capture API Integration Tests', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  it('returns 400 for missing text', async () => {
    const response = await request(app)
      .post('/api/capture')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 201 with entry and message on success', async () => {
    const mockExecute = jest.fn().mockResolvedValue({
      success: true,
      data: {
        path: 'projects/test-project',
        category: 'projects',
        name: 'Test Project',
        confidence: 0.9,
        clarificationNeeded: false
      }
    });
    const mockRead = jest.fn().mockResolvedValue({
      path: 'projects/test-project',
      category: 'projects',
      entry: {
        id: 'test-id',
        name: 'Test Project',
        tags: [],
        created_at: '2024-01-01T12:00:00Z',
        updated_at: '2024-01-01T12:00:00Z',
        source_channel: 'api',
        confidence: 0.9,
        status: 'active',
        next_action: '',
        related_people: []
      },
      content: ''
    });

    (getToolExecutor as jest.Mock).mockReturnValue({ execute: mockExecute });
    (getEntryService as jest.Mock).mockReturnValue({ read: mockRead });

    const response = await request(app)
      .post('/api/capture')
      .send({ text: 'Test project idea' });

    expect(response.status).toBe(201);
    expect(response.body.entry.path).toBe('projects/test-project');
    expect(response.body.message).toContain('Filed as project');
    expect(response.body.clarificationNeeded).toBe(false);
  });
});

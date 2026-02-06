import express from 'express';
import request from 'supertest';
import { focusRouter } from '../../../src/routes/focus';

const mockService = {
  getNextTrack: jest.fn(),
  rateTrack: jest.fn(),
  recordSession: jest.fn(),
  logProgress: jest.fn(),
  generateCongratsMessage: jest.fn()
};

jest.mock('../../../src/services/focus.service', () => ({
  getFocusService: () => mockService
}));

describe('focus routes', () => {
  const app = express();
  app.use(express.json());
  app.use('/focus', focusRouter);

  beforeEach(() => {
    jest.resetAllMocks();
  });

  it('returns next track', async () => {
    mockService.getNextTrack.mockResolvedValue({ youtubeId: 'abc', rating: 0 });
    const res = await request(app).get('/focus/tracks/next?mode=auto');
    expect(res.status).toBe(200);
    expect(res.body.youtubeId).toBe('abc');
  });

  it('validates track rating payload', async () => {
    const res = await request(app).post('/focus/tracks/rate').send({});
    expect(res.status).toBe(400);
  });

  it('validates session payload', async () => {
    const res = await request(app).post('/focus/sessions').send({ entryPath: 'admin/task' });
    expect(res.status).toBe(400);
  });

  it('validates progress payload', async () => {
    const res = await request(app).post('/focus/progress').send({ entryPath: 'admin/task' });
    expect(res.status).toBe(400);
  });

  it('returns congrats message', async () => {
    mockService.generateCongratsMessage.mockResolvedValue('Nice work.');
    const res = await request(app).post('/focus/congrats').send({ entryName: 'Task' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Nice work.');
  });
});

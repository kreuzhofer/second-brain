import request from 'supertest';
import express from 'express';
import { resetDatabase, createTestJwt, TEST_JWT_SECRET } from '../setup';
import { entriesRouter } from '../../src/routes/entries';
import { calendarRouter, calendarPublicRouter } from '../../src/routes/calendar';
import { authMiddleware } from '../../src/middleware/auth';

function parseIcsEvents(ics: string): Array<{ uid?: string; summary?: string; dtStart?: string }> {
  const lines = ics.split(/\r?\n/);
  const events: Array<{ uid?: string; summary?: string; dtStart?: string }> = [];
  let inEvent = false;
  let current: { uid?: string; summary?: string; dtStart?: string } = {};

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === 'BEGIN:VEVENT') {
      inEvent = true;
      current = {};
      continue;
    }
    if (upper === 'END:VEVENT') {
      inEvent = false;
      events.push(current);
      continue;
    }
    if (!inEvent) continue;
    if (upper.startsWith('UID:')) current.uid = line.slice(4);
    if (upper.startsWith('SUMMARY:')) current.summary = line.slice(8);
    if (upper.startsWith('DTSTART:')) current.dtStart = line.slice(8);
  }

  return events;
}

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

describe('Calendar API Integration Tests', () => {
  let app: express.Application;
  let authToken: string;
  const originalFetch = global.fetch;

  beforeAll(async () => {
    await resetDatabase();
  });

  beforeEach(async () => {
    await resetDatabase();
    app = express();
    app.use(express.json());
    app.use('/api/calendar', calendarPublicRouter);
    app.use('/api/calendar', authMiddleware, calendarRouter);
    app.use('/api/entries', authMiddleware, entriesRouter);
    authToken = createTestJwt();
    global.fetch = originalFetch;
  });

  afterAll(async () => {
    await resetDatabase();
    global.fetch = originalFetch;
  });

  it('returns a week plan from active tasks', async () => {
    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Draft retail demo one pager',
        status: 'pending',
        due_date: '2026-02-12',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const response = await request(app)
      .get('/api/calendar/plan-week?startDate=2026-02-09')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(response.body.startDate).toBe('2026-02-09');
    expect(Array.isArray(response.body.items)).toBe(true);
    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.items[0]).toEqual(
      expect.objectContaining({
        entryPath: 'task/draft-retail-demo-one-pager',
        title: expect.any(String),
        start: expect.any(String),
        end: expect.any(String)
      })
    );
  });

  it('returns publish URLs and serves feed as ICS', async () => {
    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Finalize partner update',
        status: 'pending',
        due_date: '2026-02-13',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const publishResponse = await request(app)
      .get('/api/calendar/publish')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(publishResponse.body).toEqual(
      expect.objectContaining({
        httpsUrl: expect.stringContaining('/api/calendar/feed.ics?token='),
        webcalUrl: expect.stringContaining('webcal://')
      })
    );

    const token = new URL(publishResponse.body.httpsUrl).searchParams.get('token');
    expect(token).toBeTruthy();

    const feedResponse = await request(app)
      .get(`/api/calendar/feed.ics?token=${encodeURIComponent(token as string)}`)
      .expect(200);

    expect(feedResponse.headers['content-type']).toContain('text/calendar');
    expect(feedResponse.headers['cache-control']).toContain('no-store');
    expect(feedResponse.headers['x-generated-at']).toBeTruthy();
    expect(feedResponse.headers['x-plan-revision']).toBeTruthy();
    expect(feedResponse.text).toContain('BEGIN:VCALENDAR');
    expect(feedResponse.text).toContain('REFRESH-INTERVAL;VALUE=DURATION:PT5M');
    expect(feedResponse.text).toContain('X-PUBLISHED-TTL:PT5M');
    expect(feedResponse.text).toContain('SEQUENCE:');
    expect(feedResponse.text).toContain('LAST-MODIFIED:');
    expect(feedResponse.text).toContain('SUMMARY:Finalize partner update');
  });

  it('uses an extended default horizon for the public feed', async () => {
    const dueDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Long horizon planning task',
        status: 'pending',
        due_date: dueDate,
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const publishResponse = await request(app)
      .get('/api/calendar/publish')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const token = new URL(publishResponse.body.httpsUrl).searchParams.get('token');
    expect(token).toBeTruthy();

    const feedResponse = await request(app)
      .get(`/api/calendar/feed.ics?token=${encodeURIComponent(token as string)}`)
      .expect(200);

    expect(feedResponse.text).toContain('SUMMARY:Long horizon planning task');
  });

  it('creates, updates, lists, and deletes calendar sources', async () => {
    const created = await request(app)
      .post('/api/calendar/sources')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Outlook Work',
        url: 'https://example.com/work.ics',
        color: '#1D4ED8'
      })
      .expect(201);

    expect(created.body).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        name: 'Outlook Work',
        url: 'https://example.com/work.ics',
        enabled: true
      })
    );

    const listed = await request(app)
      .get('/api/calendar/sources')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(listed.body.sources).toHaveLength(1);
    expect(listed.body.sources[0].name).toBe('Outlook Work');

    const updated = await request(app)
      .patch(`/api/calendar/sources/${created.body.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ enabled: false })
      .expect(200);

    expect(updated.body.enabled).toBe(false);

    await request(app)
      .delete(`/api/calendar/sources/${created.body.id}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(204);

    const listedAfterDelete = await request(app)
      .get('/api/calendar/sources')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(listedAfterDelete.body.sources).toHaveLength(0);
  });

  it('syncs busy blocks from ICS source and avoids conflicts when planning', async () => {
    const source = await request(app)
      .post('/api/calendar/sources')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Outlook',
        url: 'https://example.com/outlook.ics'
      })
      .expect(201);

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:busy-1',
      'DTSTART:20260209T090000Z',
      'DTEND:20260209T120000Z',
      'SUMMARY:Busy block',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name.toLowerCase() === 'etag' ? '"etag-1"' : null)
      },
      text: async () => ics
    } as any);

    await request(app)
      .post(`/api/calendar/sources/${source.body.id}/sync`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Prepare launch checklist',
        status: 'pending',
        due_date: '2026-02-09',
        source_channel: 'api',
        confidence: 0.95
      })
      .expect(201);

    const plan = await request(app)
      .get('/api/calendar/plan-week?startDate=2026-02-09&days=1')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(plan.body.items).toHaveLength(1);
    expect(plan.body.items[0].start).toContain('2026-02-09T12:00:00.000Z');
    expect(plan.body.items[0].end).toContain('2026-02-09T12:30:00.000Z');
  });

  it('uses fixed task appointment and custom task duration in week planning', async () => {
    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Prepare launch notes',
        status: 'pending',
        due_date: '2026-02-09',
        duration_minutes: 60,
        fixed_at: '2026-02-09T13:15:00.000Z',
        source_channel: 'api',
        confidence: 0.95
      })
      .expect(201);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Quick status check',
        status: 'pending',
        due_date: '2026-02-09',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const plan = await request(app)
      .get('/api/calendar/plan-week?startDate=2026-02-09&days=1')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const fixed = plan.body.items.find((item: any) => item.entryPath === 'task/prepare-launch-notes');
    expect(fixed).toBeDefined();
    expect(fixed.start).toBe('2026-02-09T13:15:00.000Z');
    expect(fixed.end).toBe('2026-02-09T14:15:00.000Z');
    expect(fixed.durationMinutes).toBe(60);

    const regular = plan.body.items.find((item: any) => item.entryPath === 'task/quick-status-check');
    expect(regular).toBeDefined();
    expect(regular.durationMinutes).toBe(30);
  });

  it('applies custom granularity and blocker buffer when planning', async () => {
    const source = await request(app)
      .post('/api/calendar/sources')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Outlook',
        url: 'https://example.com/outlook-buffer.ics'
      })
      .expect(201);

    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:busy-buffer-1',
      'DTSTART:20260209T090000Z',
      'DTEND:20260209T100000Z',
      'SUMMARY:Morning call',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        get: () => null
      },
      text: async () => ics
    } as any);

    await request(app)
      .post(`/api/calendar/sources/${source.body.id}/sync`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Prepare summary',
        status: 'pending',
        due_date: '2026-02-09',
        duration_minutes: 30,
        source_channel: 'api',
        confidence: 0.95
      })
      .expect(201);

    const plan = await request(app)
      .get('/api/calendar/plan-week?startDate=2026-02-09&days=1&granularityMinutes=30&bufferMinutes=15')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(plan.body.items).toHaveLength(1);
    expect(plan.body.items[0].start).toContain('2026-02-09T10:30:00.000Z');
    expect(plan.body.items[0].end).toContain('2026-02-09T11:00:00.000Z');
  });

  it('combines blockers from multiple enabled calendar sources', async () => {
    const sourceA = await request(app)
      .post('/api/calendar/sources')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Work',
        url: 'https://example.com/work.ics'
      })
      .expect(201);

    const sourceB = await request(app)
      .post('/api/calendar/sources')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        name: 'Private',
        url: 'https://example.com/private.ics'
      })
      .expect(201);

    const icsA = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:work-1',
      'DTSTART:20260209T090000Z',
      'DTEND:20260209T100000Z',
      'SUMMARY:Work blocker',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    const icsB = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:private-1',
      'DTSTART:20260209T100000Z',
      'DTEND:20260209T110000Z',
      'SUMMARY:Private blocker',
      'END:VEVENT',
      'END:VCALENDAR'
    ].join('\r\n');

    global.fetch = jest.fn().mockImplementation(async (url: string) => {
      const body = url.includes('/work.ics') ? icsA : icsB;
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => body
      } as any;
    });

    await request(app)
      .post(`/api/calendar/sources/${sourceA.body.id}/sync`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app)
      .post(`/api/calendar/sources/${sourceB.body.id}/sync`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Plan sprint sync',
        status: 'pending',
        due_date: '2026-02-09',
        duration_minutes: 30,
        source_channel: 'api',
        confidence: 0.95
      })
      .expect(201);

    const plan = await request(app)
      .get('/api/calendar/plan-week?startDate=2026-02-09&days=1')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(plan.body.items).toHaveLength(1);
    expect(plan.body.items[0].start).toContain('2026-02-09T11:00:00.000Z');
    expect(plan.body.items[0].end).toContain('2026-02-09T11:30:00.000Z');
  });

  it('keeps event UIDs stable for the same task across replans', async () => {
    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Task Alpha',
        status: 'pending',
        due_date: '2026-02-09',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Task Beta',
        status: 'pending',
        due_date: '2026-02-10',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const publishResponse = await request(app)
      .get('/api/calendar/publish')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const token = new URL(publishResponse.body.httpsUrl).searchParams.get('token') as string;

    const feedBefore = await request(app)
      .get(`/api/calendar/feed.ics?token=${encodeURIComponent(token)}&startDate=2026-02-09&days=1`)
      .expect(200);

    const eventsBefore = parseIcsEvents(feedBefore.text);
    const alphaBefore = eventsBefore.find((event) => event.summary === 'Task Alpha');
    expect(alphaBefore?.uid).toBeTruthy();

    await request(app)
      .patch('/api/entries/task/task-alpha')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        fixed_at: '2026-02-09T16:00:00.000Z'
      })
      .expect(200);

    const feedAfter = await request(app)
      .get(`/api/calendar/feed.ics?token=${encodeURIComponent(token)}&startDate=2026-02-09&days=1`)
      .expect(200);

    const eventsAfter = parseIcsEvents(feedAfter.text);
    const alphaAfter = eventsAfter.find((event) => event.summary === 'Task Alpha');
    expect(alphaAfter?.uid).toBe(alphaBefore?.uid);
    expect(alphaAfter?.dtStart).toBe('20260209T160000');
  });

  it('automatically reschedules missed tasks after 15 minutes grace', async () => {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const missedFixedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Missed deep work slot',
        status: 'pending',
        due_date: today,
        duration_minutes: 30,
        fixed_at: missedFixedAt,
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const plan = await request(app)
      .get('/api/calendar/plan-week?days=7&granularityMinutes=15')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    const item = plan.body.items.find((entry: any) => entry.entryPath === 'task/missed-deep-work-slot');
    expect(item).toBeDefined();
    expect(new Date(item.start).getTime()).toBeGreaterThanOrEqual(now.getTime());
    expect(item.reason).toContain('Rescheduled after missed fixed slot');
  });

  it('gets and updates scheduler settings, then applies working hours to planning', async () => {
    const initial = await request(app)
      .get('/api/calendar/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(initial.body).toEqual(
      expect.objectContaining({
        workdayStartTime: '09:00',
        workdayEndTime: '17:00',
        workingDays: [1, 2, 3, 4, 5]
      })
    );

    const updated = await request(app)
      .patch('/api/calendar/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        workdayStartTime: '13:00',
        workdayEndTime: '15:00',
        workingDays: [1]
      })
      .expect(200);

    expect(updated.body).toEqual(
      expect.objectContaining({
        workdayStartTime: '13:00',
        workdayEndTime: '15:00',
        workingDays: [1]
      })
    );

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Afternoon-only test task',
        status: 'pending',
        due_date: '2026-02-09',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const plan = await request(app)
      .get('/api/calendar/plan-week?startDate=2026-02-09&days=1')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(plan.body.items).toHaveLength(1);
    expect(plan.body.items[0].start).toContain('2026-02-09T13:00:00.000Z');
  });

  it('uses task priority to schedule higher priority tasks first', async () => {
    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Low priority task',
        status: 'pending',
        due_date: '2026-02-09',
        priority: 1,
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'High priority task',
        status: 'pending',
        due_date: '2026-02-09',
        priority: 5,
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const plan = await request(app)
      .get('/api/calendar/plan-week?startDate=2026-02-09&days=1')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(plan.body.items).toHaveLength(2);
    expect(plan.body.items[0].entryPath).toBe('task/high-priority-task');
    expect(plan.body.items[1].entryPath).toBe('task/low-priority-task');
  });

  it('exposes a manual replan endpoint', async () => {
    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Replan endpoint task',
        status: 'pending',
        due_date: '2026-02-09',
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const response = await request(app)
      .post('/api/calendar/replan')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        startDate: '2026-02-09',
        days: 1
      })
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        startDate: '2026-02-09',
        endDate: '2026-02-09',
        items: expect.any(Array),
        generatedAt: expect.any(String),
        revision: expect.any(String)
      })
    );
  });

  it('returns structured unscheduled reasons when no slots remain', async () => {
    await request(app)
      .patch('/api/calendar/settings')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        workdayStartTime: '09:00',
        workdayEndTime: '10:00',
        workingDays: [1]
      })
      .expect(200);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Task A',
        status: 'pending',
        due_date: '2026-02-09',
        duration_minutes: 30,
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Task B',
        status: 'pending',
        due_date: '2026-02-09',
        duration_minutes: 30,
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    await request(app)
      .post('/api/entries')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        category: 'task',
        name: 'Task C',
        status: 'pending',
        due_date: '2026-02-09',
        duration_minutes: 30,
        source_channel: 'api',
        confidence: 0.9
      })
      .expect(201);

    const plan = await request(app)
      .get('/api/calendar/plan-week?startDate=2026-02-09&days=1')
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    expect(plan.body.items).toHaveLength(2);
    expect(Array.isArray(plan.body.unscheduled)).toBe(true);
    expect(plan.body.unscheduled.length).toBeGreaterThan(0);
    expect(plan.body.unscheduled[0]).toEqual(
      expect.objectContaining({
        entryPath: expect.any(String),
        reasonCode: expect.stringMatching(/no_free_slot|outside_working_hours|fixed_conflict/)
      })
    );
  });

  describe('GET /calendar/busy-blocks', () => {
    it('returns 401 without auth', async () => {
      await request(app)
        .get('/api/calendar/busy-blocks?startDate=2026-02-09&endDate=2026-02-15')
        .expect(401);
    });

    it('returns 400 when startDate or endDate missing', async () => {
      await request(app)
        .get('/api/calendar/busy-blocks?startDate=2026-02-09')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      await request(app)
        .get('/api/calendar/busy-blocks?endDate=2026-02-15')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      await request(app)
        .get('/api/calendar/busy-blocks')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('returns 400 for invalid date format', async () => {
      const res = await request(app)
        .get('/api/calendar/busy-blocks?startDate=not-a-date&endDate=2026-02-15')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(res.body.error.message).toContain('Invalid startDate');
    });

    it('returns empty blocks when no sources exist', async () => {
      const res = await request(app)
        .get('/api/calendar/busy-blocks?startDate=2026-02-09&endDate=2026-02-15')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.blocks).toEqual([]);
    });

    it('returns busy blocks within date range with source metadata', async () => {
      const source = await request(app)
        .post('/api/calendar/sources')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Work Calendar',
          url: 'https://example.com/work.ics',
          color: '#3b82f6'
        })
        .expect(201);

      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:meeting-1',
        'DTSTART:20260210T100000Z',
        'DTEND:20260210T110000Z',
        'SUMMARY:Team standup',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:meeting-2',
        'DTSTART:20260211T140000Z',
        'DTEND:20260211T150000Z',
        'SUMMARY:1:1 with manager',
        'END:VEVENT',
        'BEGIN:VEVENT',
        'UID:meeting-outside',
        'DTSTART:20260220T090000Z',
        'DTEND:20260220T100000Z',
        'SUMMARY:Outside range',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name.toLowerCase() === 'etag' ? '"etag-bb"' : null)
        },
        text: async () => ics
      } as any);

      await request(app)
        .post(`/api/calendar/sources/${source.body.id}/sync`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const res = await request(app)
        .get('/api/calendar/busy-blocks?startDate=2026-02-09&endDate=2026-02-15')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.blocks).toHaveLength(2);
      expect(res.body.blocks[0]).toEqual(
        expect.objectContaining({
          sourceName: 'Work Calendar',
          sourceColor: '#3b82f6',
          title: 'Team standup',
          isAllDay: false
        })
      );
      expect(res.body.blocks[0].startAt).toContain('2026-02-10');
      expect(res.body.blocks[1].title).toBe('1:1 with manager');
    });

    it('parses SUMMARY and LOCATION lines that include ICS parameters', async () => {
      const source = await request(app)
        .post('/api/calendar/sources')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Param Calendar',
          url: 'https://example.com/param.ics'
        })
        .expect(201);

      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:param-1',
        'DTSTART:20260210T100000Z',
        'DTEND:20260210T110000Z',
        'SUMMARY;LANGUAGE=en-US:Quarterly planning',
        'LOCATION;LANGUAGE=en-US:Room 42',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => ics
      } as any);

      await request(app)
        .post(`/api/calendar/sources/${source.body.id}/sync`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const res = await request(app)
        .get('/api/calendar/busy-blocks?startDate=2026-02-09&endDate=2026-02-15')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.blocks).toHaveLength(1);
      expect(res.body.blocks[0]).toEqual(
        expect.objectContaining({
          title: 'Quarterly planning',
          location: 'Room 42'
        })
      );
    });

    it('unescapes ICS text sequences in title and location', async () => {
      const source = await request(app)
        .post('/api/calendar/sources')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Escaped Text Calendar',
          url: 'https://example.com/escaped.ics'
        })
        .expect(201);

      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:escaped-1',
        'DTSTART:20260210T100000Z',
        'DTEND:20260210T110000Z',
        'SUMMARY:Project\\; Review\\\\Prep',
        'LOCATION:Dr. Dillig\\, Friedberg',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => ics
      } as any);

      await request(app)
        .post(`/api/calendar/sources/${source.body.id}/sync`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const res = await request(app)
        .get('/api/calendar/busy-blocks?startDate=2026-02-09&endDate=2026-02-15')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.blocks).toHaveLength(1);
      expect(res.body.blocks[0]).toEqual(
        expect.objectContaining({
          title: 'Project; Review\\Prep',
          location: 'Dr. Dillig, Friedberg'
        })
      );
    });

    it('excludes blocks from disabled sources', async () => {
      const source = await request(app)
        .post('/api/calendar/sources')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'Personal',
          url: 'https://example.com/personal.ics'
        })
        .expect(201);

      const ics = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'BEGIN:VEVENT',
        'UID:personal-1',
        'DTSTART:20260210T120000Z',
        'DTEND:20260210T130000Z',
        'SUMMARY:Lunch',
        'END:VEVENT',
        'END:VCALENDAR'
      ].join('\r\n');

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => ics
      } as any);

      await request(app)
        .post(`/api/calendar/sources/${source.body.id}/sync`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Disable the source
      await request(app)
        .patch(`/api/calendar/sources/${source.body.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ enabled: false })
        .expect(200);

      const res = await request(app)
        .get('/api/calendar/busy-blocks?startDate=2026-02-09&endDate=2026-02-15')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(res.body.blocks).toHaveLength(0);
    });
  });
});

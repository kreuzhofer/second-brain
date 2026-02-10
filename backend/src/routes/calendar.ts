import { Request, Response, Router } from 'express';
import { requireUserId } from '../context/user-context';
import { getCalendarService } from '../services/calendar.service';

const MIN_DAYS = 1;
const MAX_DAYS = 14;
const MIN_GRANULARITY_MINUTES = 5;
const MAX_GRANULARITY_MINUTES = 60;
const MIN_BUFFER_MINUTES = 0;
const MAX_BUFFER_MINUTES = 120;
const FEED_DEFAULT_DAYS = 14;

function parseDays(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < MIN_DAYS || parsed > MAX_DAYS) {
    return NaN;
  }
  return Math.floor(parsed);
}

function parseGranularity(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (
    !Number.isFinite(parsed) ||
    parsed < MIN_GRANULARITY_MINUTES ||
    parsed > MAX_GRANULARITY_MINUTES
  ) {
    return NaN;
  }
  return Math.floor(parsed);
}

function parseBuffer(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < MIN_BUFFER_MINUTES || parsed > MAX_BUFFER_MINUTES) {
    return NaN;
  }
  return Math.floor(parsed);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export const calendarPublicRouter = Router();
export const calendarRouter = Router();

calendarPublicRouter.get('/feed.ics', async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (!token) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing calendar token'
      }
    });
    return;
  }

  const calendarService = getCalendarService();
  const verified = calendarService.verifyFeedToken(token);
  if (!verified) {
    res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid calendar token'
      }
    });
    return;
  }

  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
  const parsedDays = parseDays(req.query.days);
  const parsedGranularity = parseGranularity(req.query.granularityMinutes);
  const parsedBuffer = parseBuffer(req.query.bufferMinutes);
  if (Number.isNaN(parsedDays)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid days. Use an integer between ${MIN_DAYS} and ${MAX_DAYS}`
      }
    });
    return;
  }
  if (Number.isNaN(parsedGranularity)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid granularityMinutes. Use an integer between ${MIN_GRANULARITY_MINUTES} and ${MAX_GRANULARITY_MINUTES}`
      }
    });
    return;
  }
  if (Number.isNaN(parsedBuffer)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid bufferMinutes. Use an integer between ${MIN_BUFFER_MINUTES} and ${MAX_BUFFER_MINUTES}`
      }
    });
    return;
  }

  try {
    const ics = await calendarService.buildIcsFeedForUser(verified.userId, {
      startDate,
      days: parsedDays ?? FEED_DEFAULT_DAYS,
      granularityMinutes: parsedGranularity,
      bufferMinutes: parsedBuffer
    });
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="second-brain-week-plan.ics"');
    res.send(ics);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build calendar feed';
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message
      }
    });
  }
});

calendarRouter.get('/plan-week', async (req: Request, res: Response) => {
  const calendarService = getCalendarService();
  const userId = requireUserId();

  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
  const parsedDays = parseDays(req.query.days);
  const parsedGranularity = parseGranularity(req.query.granularityMinutes);
  const parsedBuffer = parseBuffer(req.query.bufferMinutes);
  if (Number.isNaN(parsedDays)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid days. Use an integer between ${MIN_DAYS} and ${MAX_DAYS}`
      }
    });
    return;
  }
  if (Number.isNaN(parsedGranularity)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid granularityMinutes. Use an integer between ${MIN_GRANULARITY_MINUTES} and ${MAX_GRANULARITY_MINUTES}`
      }
    });
    return;
  }
  if (Number.isNaN(parsedBuffer)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid bufferMinutes. Use an integer between ${MIN_BUFFER_MINUTES} and ${MAX_BUFFER_MINUTES}`
      }
    });
    return;
  }

  try {
    const plan = await calendarService.buildWeekPlanForUser(userId, {
      startDate,
      days: parsedDays,
      granularityMinutes: parsedGranularity,
      bufferMinutes: parsedBuffer
    });
    res.json(plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to build week plan';
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message
      }
    });
  }
});

calendarRouter.get('/publish', async (req: Request, res: Response) => {
  const calendarService = getCalendarService();
  const userId = requireUserId();
  const { token, expiresAt } = calendarService.createFeedToken(userId);

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const httpsUrl = `${baseUrl}/api/calendar/feed.ics?token=${encodeURIComponent(token)}`;
  const webcalUrl = httpsUrl.replace(/^https?:\/\//, 'webcal://');

  res.json({
    httpsUrl,
    webcalUrl,
    expiresAt
  });
});

calendarRouter.get('/sources', async (_req: Request, res: Response) => {
  const calendarService = getCalendarService();
  const userId = requireUserId();

  const sources = await calendarService.listSourcesForUser(userId);
  res.json({ sources });
});

calendarRouter.post('/sources', async (req: Request, res: Response) => {
  const calendarService = getCalendarService();
  const userId = requireUserId();
  const { name, url, color } = req.body || {};

  try {
    const source = await calendarService.createSourceForUser(userId, {
      name,
      url,
      color
    });
    res.status(201).json(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create source';
    const isConflict = message.includes('Unique constraint');
    res.status(isConflict ? 409 : 400).json({
      error: {
        code: isConflict ? 'CONFLICT' : 'VALIDATION_ERROR',
        message
      }
    });
  }
});

calendarRouter.patch('/sources/:sourceId', async (req: Request, res: Response) => {
  const calendarService = getCalendarService();
  const userId = requireUserId();
  const sourceId = req.params.sourceId;
  const { name, enabled, color } = req.body || {};

  if (enabled !== undefined && !isBoolean(enabled)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'enabled must be a boolean'
      }
    });
    return;
  }

  try {
    const source = await calendarService.updateSourceForUser(userId, sourceId, {
      name,
      enabled,
      color
    });
    res.json(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update source';
    const status = message.includes('not found') ? 404 : 400;
    res.status(status).json({
      error: {
        code: status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR',
        message
      }
    });
  }
});

calendarRouter.delete('/sources/:sourceId', async (req: Request, res: Response) => {
  const calendarService = getCalendarService();
  const userId = requireUserId();
  const sourceId = req.params.sourceId;

  try {
    await calendarService.deleteSourceForUser(userId, sourceId);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete source';
    const status = message.includes('not found') ? 404 : 400;
    res.status(status).json({
      error: {
        code: status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR',
        message
      }
    });
  }
});

calendarRouter.post('/sources/:sourceId/sync', async (req: Request, res: Response) => {
  const calendarService = getCalendarService();
  const userId = requireUserId();
  const sourceId = req.params.sourceId;

  try {
    const result = await calendarService.syncSourceForUser(userId, sourceId);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sync source';
    const status = message.includes('not found') ? 404 : 400;
    res.status(status).json({
      error: {
        code: status === 404 ? 'NOT_FOUND' : 'VALIDATION_ERROR',
        message
      }
    });
  }
});

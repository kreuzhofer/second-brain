import { Request, Response, Router } from 'express';
import { requireUserId, runWithUserId } from '../context/user-context';
import { getCalendarService } from '../services/calendar.service';
import { getEntryService } from '../services/entry.service';

const MIN_DAYS = 1;
const MAX_DAYS = 14;
const MIN_GRANULARITY_MINUTES = 5;
const MAX_GRANULARITY_MINUTES = 60;
const MIN_BUFFER_MINUTES = 0;
const MAX_BUFFER_MINUTES = 120;
const FEED_DEFAULT_DAYS = 14;
const TIME_REGEX = /^\d{2}:\d{2}$/;

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

function parseWorkingDays(value: unknown): number[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 6);
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
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    const feed = await calendarService.buildIcsFeedForUser(
      verified.userId,
      {
        startDate,
        days: parsedDays ?? FEED_DEFAULT_DAYS,
        granularityMinutes: parsedGranularity,
        bufferMinutes: parsedBuffer
      },
      { baseUrl, feedToken: token }
    );
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="justdo-week-plan.ics"');
    res.setHeader('X-Generated-At', feed.generatedAt);
    res.setHeader('X-Plan-Revision', feed.revision);
    res.send(feed.ics);
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

calendarPublicRouter.get('/quick-action', async (req: Request, res: Response) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const entryPath = typeof req.query.entry === 'string' ? req.query.entry : '';
  const action = typeof req.query.action === 'string' ? req.query.action : '';
  const sig = typeof req.query.sig === 'string' ? req.query.sig : '';

  if (!token || !entryPath || !action || !sig) {
    res.status(400).send(quickActionHtml('Missing parameters', false));
    return;
  }

  const calendarService = getCalendarService();
  const verified = calendarService.verifyFeedToken(token);
  if (!verified) {
    res.status(401).send(quickActionHtml('Invalid or expired token', false));
    return;
  }

  if (!calendarService.verifyQuickAction(token, entryPath, action, sig)) {
    res.status(403).send(quickActionHtml('Invalid signature', false));
    return;
  }

  try {
    const result = await runWithUserId(verified.userId, async () => {
      const entryService = getEntryService();

      if (action === 'open') {
        return { redirect: true, message: '' };
      }

      if (action === 'done') {
        await entryService.update(entryPath, { status: 'done' } as any);
        return { redirect: false, message: `Marked "${entryPath}" as done` };
      }

      if (action === 'skip') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(9, 0, 0, 0);
        await entryService.update(entryPath, { fixed_at: tomorrow.toISOString() } as any);
        return { redirect: false, message: `Skipped "${entryPath}" — rescheduled to tomorrow` };
      }

      return { redirect: false, message: 'Unknown action' };
    });

    if (result.redirect) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      res.redirect(`${baseUrl}/entries/${entryPath}`);
      return;
    }

    res.send(quickActionHtml(result.message, true));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Action failed';
    res.status(400).send(quickActionHtml(message, false));
  }
});

function quickActionHtml(message: string, success: boolean): string {
  const color = success ? '#22c55e' : '#ef4444';
  const icon = success ? '&#10003;' : '&#10007;';
  const safeMessage = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>JustDo.so</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb}
.card{text-align:center;padding:2rem 3rem;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);background:#fff}
.icon{font-size:3rem;color:${color}}.msg{margin-top:1rem;font-size:1.1rem;color:#374151}
.hint{margin-top:.75rem;font-size:.85rem;color:#9ca3af}</style></head>
<body><div class="card"><div class="icon">${icon}</div><div class="msg">${safeMessage}</div>
<div class="hint">You can close this tab.</div></div></body></html>`;
}

calendarRouter.get('/settings', async (_req: Request, res: Response) => {
  const calendarService = getCalendarService();
  const userId = requireUserId();
  const settings = await calendarService.getSettingsForUser(userId);
  res.json(settings);
});

calendarRouter.patch('/settings', async (req: Request, res: Response) => {
  const calendarService = getCalendarService();
  const userId = requireUserId();
  const { workdayStartTime, workdayEndTime, workingDays } = req.body || {};
  const updates: {
    workdayStartTime?: string;
    workdayEndTime?: string;
    workingDays?: number[];
  } = {};

  if (workdayStartTime !== undefined) {
    if (typeof workdayStartTime !== 'string' || !TIME_REGEX.test(workdayStartTime)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workdayStartTime must use HH:mm format'
        }
      });
      return;
    }
    updates.workdayStartTime = workdayStartTime;
  }

  if (workdayEndTime !== undefined) {
    if (typeof workdayEndTime !== 'string' || !TIME_REGEX.test(workdayEndTime)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workdayEndTime must use HH:mm format'
        }
      });
      return;
    }
    updates.workdayEndTime = workdayEndTime;
  }

  if (workingDays !== undefined) {
    const parsed = parseWorkingDays(workingDays);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'workingDays must be an array of integers between 0 and 6'
        }
      });
      return;
    }
    updates.workingDays = parsed;
  }

  try {
    const settings = await calendarService.updateSettingsForUser(userId, updates);
    res.json(settings);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update settings';
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message
      }
    });
  }
});

calendarRouter.get('/busy-blocks', async (req: Request, res: Response) => {
  const calendarService = getCalendarService();
  const userId = requireUserId();

  const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

  if (!startDate || !endDate) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Both startDate and endDate query parameters are required (YYYY-MM-DD)'
      }
    });
    return;
  }

  try {
    const blocks = await calendarService.listBusyBlocksForUser(userId, startDate, endDate);
    res.json({ blocks });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to list busy blocks';
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

calendarRouter.post('/replan', async (req: Request, res: Response) => {
  const calendarService = getCalendarService();
  const userId = requireUserId();
  const { startDate, days, granularityMinutes, bufferMinutes } = req.body || {};
  const parsedDays = parseDays(days);
  const parsedGranularity = parseGranularity(granularityMinutes);
  const parsedBuffer = parseBuffer(bufferMinutes);
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
    const plan = await calendarService.buildReplanForUser(userId, {
      startDate: typeof startDate === 'string' ? startDate : undefined,
      days: parsedDays,
      granularityMinutes: parsedGranularity,
      bufferMinutes: parsedBuffer
    });
    res.json(plan);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to replan schedule';
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

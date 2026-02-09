import { Request, Response, Router } from 'express';
import { requireUserId } from '../context/user-context';
import { getCalendarService } from '../services/calendar.service';

const MIN_DAYS = 1;
const MAX_DAYS = 14;

function parseDays(raw: unknown): number | undefined {
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < MIN_DAYS || parsed > MAX_DAYS) {
    return NaN;
  }
  return Math.floor(parsed);
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
  if (Number.isNaN(parsedDays)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid days. Use an integer between ${MIN_DAYS} and ${MAX_DAYS}`
      }
    });
    return;
  }

  try {
    const ics = await calendarService.buildIcsFeedForUser(verified.userId, {
      startDate,
      days: parsedDays
    });
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
  if (Number.isNaN(parsedDays)) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: `Invalid days. Use an integer between ${MIN_DAYS} and ${MAX_DAYS}`
      }
    });
    return;
  }

  try {
    const plan = await calendarService.buildWeekPlanForUser(userId, {
      startDate,
      days: parsedDays
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

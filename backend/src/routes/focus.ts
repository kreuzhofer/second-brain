import { Router, Request, Response } from 'express';
import { getFocusService } from '../services/focus.service';

export const focusRouter = Router();

/**
 * GET /api/focus/tracks/next
 * Returns the next focus track to play.
 */
focusRouter.get('/tracks/next', async (req: Request, res: Response) => {
  try {
    const mode = req.query.mode === 'new' ? 'new' : 'auto';
    const excludeYoutubeId = typeof req.query.exclude === 'string' ? req.query.exclude : undefined;
    const service = getFocusService();
    const track = await service.getNextTrack({ mode, excludeYoutubeId });
    res.json(track);
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to fetch focus track'
      }
    });
  }
});

/**
 * POST /api/focus/tracks/rate
 * Rate a focus track (1 = like, -1 = dislike, 0 = neutral).
 */
focusRouter.post('/tracks/rate', async (req: Request, res: Response) => {
  try {
    const { youtubeId, rating } = req.body as { youtubeId?: string; rating?: number };
    if (!youtubeId || typeof rating !== 'number') {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'youtubeId and rating are required'
        }
      });
      return;
    }

    const service = getFocusService();
    const track = await service.rateTrack(youtubeId, rating);
    res.json(track);
  } catch (error) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error instanceof Error ? error.message : 'Failed to rate track'
      }
    });
  }
});

/**
 * POST /api/focus/sessions
 * Record a completed focus session and append to entry log.
 */
focusRouter.post('/sessions', async (req: Request, res: Response) => {
  try {
    const { entryPath, durationSeconds, startedAt, endedAt, trackYoutubeId, notes } = req.body as {
      entryPath?: string;
      durationSeconds?: number;
      startedAt?: string;
      endedAt?: string;
      trackYoutubeId?: string;
      notes?: string;
    };

    if (!entryPath || !durationSeconds || !startedAt || !endedAt) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'entryPath, durationSeconds, startedAt, and endedAt are required'
        }
      });
      return;
    }

    const service = getFocusService();
    const session = await service.recordSession({
      entryPath,
      durationSeconds,
      startedAt,
      endedAt,
      trackYoutubeId,
      notes
    });
    res.json(session);
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to record focus session'
      }
    });
  }
});

/**
 * POST /api/focus/progress
 * Append a manual progress note to the entry log.
 */
focusRouter.post('/progress', async (req: Request, res: Response) => {
  try {
    const { entryPath, note } = req.body as { entryPath?: string; note?: string };
    if (!entryPath || !note) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'entryPath and note are required'
        }
      });
      return;
    }

    const service = getFocusService();
    await service.logProgress(entryPath, note);
  res.status(204).send();
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to log progress'
      }
    });
  }
});

/**
 * POST /api/focus/congrats
 * Generate a short congratulatory message.
 */
focusRouter.post('/congrats', async (req: Request, res: Response) => {
  try {
    const { entryPath, entryName, minutes } = req.body as {
      entryPath?: string;
      entryName?: string;
      minutes?: number;
    };

    if (!entryPath && !entryName) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'entryPath or entryName is required'
        }
      });
      return;
    }

    const service = getFocusService();
    const message = await service.generateCongratsMessage({ entryPath, entryName, minutes });
    res.json({ message });
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Failed to generate message'
      }
    });
  }
});

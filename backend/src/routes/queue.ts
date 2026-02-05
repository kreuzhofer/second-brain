/**
 * Offline Queue API Routes
 * Provides visibility into queued and failed capture items.
 */

import { Router, Request, Response } from 'express';
import { getOfflineQueueService } from '../services/offline-queue.service';

export const queueRouter = Router();

/**
 * GET /api/queue/status
 * Returns counts of pending, processing, and failed items.
 */
queueRouter.get('/status', async (_req: Request, res: Response) => {
  const queueService = getOfflineQueueService();
  const status = await queueService.getStatus();
  res.json(status);
});

/**
 * GET /api/queue/failed
 * Returns failed items with error details.
 */
queueRouter.get('/failed', async (_req: Request, res: Response) => {
  const queueService = getOfflineQueueService();
  const failed = await queueService.listFailed();
  res.json({ failed });
});

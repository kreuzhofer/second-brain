import { Router, Request, Response } from 'express';

export const healthRouter = Router();

/**
 * GET /api/health
 * Health check endpoint - no authentication required
 */
healthRouter.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'justdo-api',
    version: '0.1.0'
  });
});

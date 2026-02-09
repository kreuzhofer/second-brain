import { Router, Request, Response } from 'express';
import { getRelationshipInsightsService } from '../services/relationship-insights.service';

export const insightsRouter = Router();

insightsRouter.get('/relationships', async (req: Request, res: Response) => {
  try {
    const limitRaw = req.query.limit;
    const limit = limitRaw ? Number.parseInt(String(limitRaw), 10) : 5;

    if (!Number.isFinite(limit) || limit < 1 || limit > 20) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'limit must be an integer between 1 and 20'
        }
      });
      return;
    }

    const insightsService = getRelationshipInsightsService();
    const insights = await insightsService.listTopPeople(limit);
    res.json({ insights });
  } catch (error) {
    console.error('Error building relationship insights:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to build relationship insights'
      }
    });
  }
});

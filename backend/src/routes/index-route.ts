import { Router, Request, Response } from 'express';
import { getIndexService } from '../services/index.service';

export const indexRouter = Router();

/**
 * GET /api/index
 * Get the index.md content
 */
indexRouter.get('/', async (req: Request, res: Response) => {
  try {
    const indexService = getIndexService();
    const content = await indexService.getIndexContent();
    
    // Return as plain text
    res.type('text/markdown').send(content);
  } catch (error) {
    console.error('Error getting index:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to get index'
      }
    });
  }
});

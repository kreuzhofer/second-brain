/**
 * Digest API Routes
 * Provides endpoints for manually triggering digests and reviews.
 */

import { Router, Request, Response } from 'express';
import { getDigestService } from '../services/digest.service';

export const digestRouter = Router();

/**
 * GET /api/digest
 * Manually trigger a digest or review generation
 * 
 * Query Parameters:
 * - type: 'daily' | 'weekly' (required)
 * 
 * Response:
 * - 200: { type, content, generatedAt }
 * - 400: Invalid type parameter
 * - 500: Generation failed
 */
digestRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    
    // Validate type parameter
    if (!type || (type !== 'daily' && type !== 'weekly')) {
      return res.status(400).json({
        error: {
          code: 'INVALID_TYPE',
          message: 'Query parameter "type" must be "daily" or "weekly"'
        }
      });
    }

    const digestService = getDigestService();
    let content: string;

    if (type === 'daily') {
      content = await digestService.generateDailyDigest();
    } else {
      content = await digestService.generateWeeklyReview();
    }

    return res.json({
      type,
      content,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('Digest generation failed:', error);
    return res.status(500).json({
      error: {
        code: 'GENERATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error'
      }
    });
  }
});

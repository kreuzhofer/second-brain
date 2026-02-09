import { Router, Request, Response } from 'express';
import { getSearchService } from '../services/search.service';
import { Category } from '../types/entry.types';

export const searchRouter = Router();

const VALID_CATEGORIES: Category[] = ['people', 'projects', 'ideas', 'task', 'admin', 'inbox'];

/**
 * GET /api/search
 * Search entries with hybrid (keyword + semantic) search
 */
searchRouter.get('/', async (req: Request, res: Response) => {
  try {
    const query = (req.query.query || req.query.q) as string | undefined;
    const category = req.query.category as Category | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    if (!query || query.trim().length === 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query parameter "query" is required'
        }
      });
      return;
    }

    if (category && !VALID_CATEGORIES.includes(category)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`
        }
      });
      return;
    }

    if (limit !== undefined && (isNaN(limit) || limit < 1)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Limit must be a positive integer'
        }
      });
      return;
    }

    const searchService = getSearchService();
    const result = await searchService.search(query, { category, limit });
    res.json(result);
  } catch (error) {
    console.error('Error searching entries:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to search entries'
      }
    });
  }
});

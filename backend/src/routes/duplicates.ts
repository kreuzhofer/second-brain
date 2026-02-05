import { Router, Request, Response } from 'express';
import { getDuplicateService } from '../services/duplicate.service';
import { Category } from '../types/entry.types';
import { EntryNotFoundError } from '../services/entry.service';

export const duplicatesRouter = Router();

const VALID_CATEGORIES: Category[] = ['people', 'projects', 'ideas', 'admin', 'inbox'];

/**
 * GET /api/duplicates?path=projects/foo.md
 */
duplicatesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const path = req.query.path as string | undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

    if (!path) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Query parameter "path" is required'
        }
      });
      return;
    }

    const duplicateService = getDuplicateService();
    const duplicates = await duplicateService.findDuplicatesForEntry(path, limit);
    res.json({ duplicates });
  } catch (error) {
    if (error instanceof EntryNotFoundError) {
      res.status(404).json({
        error: {
          code: 'NOT_FOUND',
          message: error.message
        }
      });
      return;
    }
    console.error('Error finding duplicates:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to find duplicates'
      }
    });
  }
});

/**
 * POST /api/duplicates
 */
duplicatesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { name, text, category, limit, excludePath } = req.body as {
      name?: string;
      text?: string;
      category?: Category;
      limit?: number;
      excludePath?: string;
    };

    if (!name && !text) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either name or text is required'
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

    const duplicateService = getDuplicateService();
    const duplicates = await duplicateService.findDuplicatesForText({
      name,
      text,
      category,
      limit,
      excludePath
    });

    res.json({ duplicates });
  } catch (error) {
    console.error('Error finding duplicates:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to find duplicates'
      }
    });
  }
});

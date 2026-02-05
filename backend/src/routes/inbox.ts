import { Router, Request, Response } from 'express';
import { Category } from '../types/entry.types';
import { getTriageService } from '../services/triage.service';
import { EntryNotFoundError, InvalidEntryDataError } from '../services/entry.service';

export const inboxRouter = Router();

const VALID_CATEGORIES: Category[] = ['people', 'projects', 'ideas', 'admin'];

/**
 * POST /api/inbox/triage
 * Batch triage operations for inbox entries
 */
inboxRouter.post('/triage', async (req: Request, res: Response) => {
  try {
    const { action, paths, targetCategory, targetPath } = req.body as {
      action?: 'move' | 'resolve' | 'merge';
      paths?: string[];
      targetCategory?: Category;
      targetPath?: string;
    };

    if (!action || !['move', 'resolve', 'merge'].includes(action)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Action must be one of: move, resolve, merge'
        }
      });
      return;
    }

    if (!paths || !Array.isArray(paths) || paths.length === 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Paths array is required'
        }
      });
      return;
    }

    const triageService = getTriageService();

    if (action === 'move') {
      if (!targetCategory || !VALID_CATEGORIES.includes(targetCategory)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: `targetCategory must be one of: ${VALID_CATEGORIES.join(', ')}`
          }
        });
        return;
      }
      const results = await triageService.move(paths, targetCategory, 'api');
      res.json({ entries: results });
      return;
    }

    if (action === 'resolve') {
      await triageService.resolve(paths, 'api');
      res.status(204).send();
      return;
    }

    if (action === 'merge') {
      if (!targetPath || typeof targetPath !== 'string') {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'targetPath is required for merge'
          }
        });
        return;
      }
      const result = await triageService.merge(paths, targetPath, 'api');
      res.json({ entry: result });
      return;
    }
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
    if (error instanceof InvalidEntryDataError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message
        }
      });
      return;
    }
    console.error('Error triaging inbox:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to triage inbox entries'
      }
    });
  }
});

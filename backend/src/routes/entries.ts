import { Router, Request, Response } from 'express';
import {
  EntryService,
  getEntryService,
  EntryNotFoundError,
  EntryAlreadyExistsError,
  InvalidEntryDataError
} from '../services/entry.service';
import { Category, EntryFilters } from '../types/entry.types';

export const entriesRouter = Router();

const VALID_CATEGORIES: Category[] = ['people', 'projects', 'ideas', 'admin', 'inbox'];

/**
 * GET /api/entries
 * List entries with optional category and status filters
 */
entriesRouter.get('/', async (req: Request, res: Response) => {
  try {
    const entryService = getEntryService();
    const category = req.query.category as Category | undefined;
    const status = req.query.status as string | undefined;

    // Validate category if provided
    if (category && !VALID_CATEGORIES.includes(category)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}`
        }
      });
      return;
    }

    const filters: EntryFilters = {};
    if (status) {
      filters.status = status;
    }

    const entries = await entryService.list(category, filters);
    res.json({ entries });
  } catch (error) {
    console.error('Error listing entries:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to list entries'
      }
    });
  }
});

/**
 * GET /api/entries/:path(*)
 * Get a single entry by path
 */
entriesRouter.get('/:path(*)', async (req: Request, res: Response) => {
  try {
    const entryService = getEntryService();
    const path = req.params.path;

    if (!path) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Entry path is required'
        }
      });
      return;
    }

    const entry = await entryService.read(path);
    res.json(entry);
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
    console.error('Error reading entry:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to read entry'
      }
    });
  }
});

/**
 * POST /api/entries
 * Create a new entry
 */
entriesRouter.post('/', async (req: Request, res: Response) => {
  try {
    const entryService = getEntryService();
    const { category, ...data } = req.body;

    // Validate category
    if (!category || !VALID_CATEGORIES.includes(category)) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: `Category is required and must be one of: ${VALID_CATEGORIES.join(', ')}`
        }
      });
      return;
    }

    // Validate required fields based on category
    if (category === 'inbox') {
      if (!data.original_text || !data.suggested_category || !data.suggested_name) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Inbox entries require: original_text, suggested_category, suggested_name'
          }
        });
        return;
      }
    } else {
      if (!data.name) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Entry name is required'
          }
        });
        return;
      }
    }

    const entry = await entryService.create(category, data);
    res.status(201).json(entry);
  } catch (error) {
    if (error instanceof EntryAlreadyExistsError) {
      res.status(409).json({
        error: {
          code: 'CONFLICT',
          message: error.message
        }
      });
      return;
    }
    if (error instanceof InvalidEntryDataError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: error.details
        }
      });
      return;
    }
    console.error('Error creating entry:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create entry'
      }
    });
  }
});

/**
 * PATCH /api/entries/:path(*)
 * Update an existing entry
 */
entriesRouter.patch('/:path(*)', async (req: Request, res: Response) => {
  try {
    const entryService = getEntryService();
    const path = req.params.path;
    const updates = req.body;

    if (!path) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Entry path is required'
        }
      });
      return;
    }

    if (!updates || Object.keys(updates).length === 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Update data is required'
        }
      });
      return;
    }

    const entry = await entryService.update(path, updates);
    res.json(entry);
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
          message: error.message,
          details: error.details
        }
      });
      return;
    }
    console.error('Error updating entry:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update entry'
      }
    });
  }
});

/**
 * DELETE /api/entries/:path(*)
 * Delete an entry
 */
entriesRouter.delete('/:path(*)', async (req: Request, res: Response) => {
  try {
    const entryService = getEntryService();
    const path = req.params.path;

    if (!path) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Entry path is required'
        }
      });
      return;
    }

    await entryService.delete(path);
    res.status(204).send();
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
    console.error('Error deleting entry:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to delete entry'
      }
    });
  }
});

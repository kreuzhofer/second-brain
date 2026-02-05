/**
 * Capture API Routes
 * Handles capture via REST API without chat context.
 *
 * Requirements: REST capture endpoint for raw thoughts
 */

import { Router, Request, Response } from 'express';
import { getToolExecutor } from '../services/tool-executor';
import { getEntryService } from '../services/entry.service';

export const captureRouter = Router();

/**
 * POST /api/capture
 * Capture a raw thought and classify it into the knowledge base.
 */
captureRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { text, hints } = req.body as { text?: string; hints?: string };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Text is required and must be a non-empty string'
        }
      });
      return;
    }

    const toolExecutor = getToolExecutor();
    const result = await toolExecutor.execute(
      {
        name: 'classify_and_capture',
        arguments: { text: text.trim(), ...(hints ? { hints } : {}) }
      },
      { channel: 'api' }
    );

    if (!result.success || !result.data) {
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: result.error || 'Failed to capture entry'
        }
      });
      return;
    }

    const capture = result.data as {
      path: string;
      category: string;
      name: string;
      confidence: number;
      clarificationNeeded: boolean;
      queued?: boolean;
      queueId?: string;
      message?: string;
    };

    if (capture.queued) {
      res.status(202).json({
        message: capture.message || 'Capture queued and will be processed when available.',
        queueId: capture.queueId
      });
      return;
    }

    const entryService = getEntryService();
    const entry = await entryService.read(capture.path);

    const message = capture.category === 'inbox'
      ? `Captured to inbox (confidence ${Math.round(capture.confidence * 100)}%).`
      : `Filed as ${capture.category.slice(0, -1)}: ${capture.name}.`;

    res.status(201).json({
      entry,
      message,
      clarificationNeeded: capture.clarificationNeeded
    });
  } catch (error) {
    console.error('Error capturing entry:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to capture entry'
      }
    });
  }
});

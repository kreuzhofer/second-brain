/**
 * Capture API Routes
 * Handles capture via REST API without chat context.
 *
 * Requirements: REST capture endpoint for raw thoughts
 */

import { Router, Request, Response } from 'express';
import { getToolExecutor } from '../services/tool-executor';
import { getEntryService } from '../services/entry.service';
import {
  getTranscriptionService,
  TranscriptionUnavailableError,
  TranscriptionValidationError
} from '../services/transcription.service';

export const captureRouter = Router();

/**
 * POST /api/capture/transcribe
 * Transcribe base64 audio payload into text using Whisper.
 */
captureRouter.post('/transcribe', async (req: Request, res: Response) => {
  try {
    const { audioBase64, mimeType } = req.body as {
      audioBase64?: string;
      mimeType?: string;
    };

    if (!audioBase64 || typeof audioBase64 !== 'string' || audioBase64.trim().length === 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'audioBase64 is required and must be a non-empty string'
        }
      });
      return;
    }

    const normalizedBase64 = audioBase64.includes(',')
      ? audioBase64.split(',', 2)[1]
      : audioBase64;
    if (!normalizedBase64 || normalizedBase64.trim().length === 0) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'audioBase64 payload is invalid'
        }
      });
      return;
    }

    const transcriptionService = getTranscriptionService();
    const text = await transcriptionService.transcribeBase64Audio(
      normalizedBase64.trim(),
      typeof mimeType === 'string' ? mimeType : undefined
    );

    res.status(200).json({ text });
  } catch (error) {
    if (error instanceof TranscriptionValidationError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message
        }
      });
      return;
    }

    if (error instanceof TranscriptionUnavailableError) {
      res.status(503).json({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: error.message
        }
      });
      return;
    }

    console.error('Error transcribing audio:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to transcribe audio'
      }
    });
  }
});

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

    const categoryLabel = capture.category === 'task'
      ? 'task'
      : capture.category.slice(0, -1);
    const message = capture.category === 'inbox'
      ? `Captured to inbox (confidence ${Math.round(capture.confidence * 100)}%).`
      : `Filed as ${categoryLabel}: ${capture.name}.`;

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

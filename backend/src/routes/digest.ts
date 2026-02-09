/**
 * Digest API Routes
 * Provides endpoints for manually triggering digests and reviews.
 */

import { Router, Request, Response } from 'express';
import { getDigestService } from '../services/digest.service';
import { getDigestPreferencesService, DigestPreferences } from '../services/digest-preferences.service';
import { Category } from '../types/entry.types';
import { getConfig } from '../config/env';

export const digestRouter = Router();

const VALID_CATEGORIES: Category[] = ['people', 'projects', 'ideas', 'task', 'admin', 'inbox'];

function parseBool(value: unknown, defaultValue?: boolean): boolean | undefined {
  if (value === undefined) return defaultValue;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return defaultValue;
}

function parsePreferences(query: Record<string, unknown>): DigestPreferences {
  const focus = typeof query.focus === 'string'
    ? query.focus.split(',').map((v) => v.trim()).filter(Boolean)
    : [];
  const focusCategories = focus.filter((cat) => VALID_CATEGORIES.includes(cat as Category)) as Category[];

  const maxItems = query.max_items ? parseInt(query.max_items as string, 10) : undefined;
  const maxWords = query.max_words ? parseInt(query.max_words as string, 10) : undefined;
  const maxOpenLoops = query.max_open_loops ? parseInt(query.max_open_loops as string, 10) : undefined;
  const maxSuggestions = query.max_suggestions ? parseInt(query.max_suggestions as string, 10) : undefined;

  return {
    focusCategories: focusCategories.length > 0 ? focusCategories : undefined,
    maxItems: isNaN(Number(maxItems)) ? undefined : maxItems,
    maxWords: isNaN(Number(maxWords)) ? undefined : maxWords,
    maxOpenLoops: isNaN(Number(maxOpenLoops)) ? undefined : maxOpenLoops,
    maxSuggestions: isNaN(Number(maxSuggestions)) ? undefined : maxSuggestions,
    includeStaleInbox: parseBool(query.include_stale_inbox),
    includeSmallWins: parseBool(query.include_small_wins),
    includeOpenLoops: parseBool(query.include_open_loops),
    includeSuggestions: parseBool(query.include_suggestions),
    includeTheme: parseBool(query.include_theme)
  };
}

/**
 * GET /api/digest
 * Manually trigger a digest or review generation
 * 
 * Query Parameters:
 * - type: 'daily' | 'weekly' (required)
 * - send: 'true' to also send via email (optional)
 * 
 * Response:
 * - 200: { type, content, generatedAt, emailSent? }
 * - 400: Invalid type parameter
 * - 500: Generation failed
 */
digestRouter.get('/', async (req: Request, res: Response) => {
  try {
    const { type, send } = req.query;
    
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
    const config = getConfig();
    let content: string;
    const preferences = parsePreferences(req.query as Record<string, unknown>);

    if (type === 'daily') {
      content = await digestService.generateDailyDigest(preferences);
    } else {
      content = await digestService.generateWeeklyReview(preferences);
    }

    let emailSent = false;
    
    // Send via email if requested and configured
    if (send === 'true' && config.DIGEST_RECIPIENT_EMAIL) {
      if (type === 'daily') {
        emailSent = await digestService.deliverDailyDigestToEmail(config.DIGEST_RECIPIENT_EMAIL, content);
      } else {
        emailSent = await digestService.deliverWeeklyReviewToEmail(config.DIGEST_RECIPIENT_EMAIL, content);
      }
    }

    return res.json({
      type,
      content,
      generatedAt: new Date().toISOString(),
      ...(send === 'true' && { emailSent, recipientEmail: config.DIGEST_RECIPIENT_EMAIL })
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

/**
 * GET /api/digest/preferences
 * Retrieve stored digest preferences
 */
digestRouter.get('/preferences', async (_req: Request, res: Response) => {
  try {
    const service = getDigestPreferencesService();
    const preferences = await service.getPreferences();
    res.json(preferences);
  } catch (error) {
    console.error('Failed to fetch digest preferences:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to fetch digest preferences'
      }
    });
  }
});

/**
 * PUT /api/digest/preferences
 * Update stored digest preferences
 */
digestRouter.put('/preferences', async (req: Request, res: Response) => {
  try {
    const service = getDigestPreferencesService();
    const preferences = await service.savePreferences(req.body as DigestPreferences);
    res.json(preferences);
  } catch (error) {
    console.error('Failed to save digest preferences:', error);
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to save digest preferences'
      }
    });
  }
});

/**
 * Push Notification Routes
 * Endpoints for managing Web Push subscriptions.
 */

import { Router, Request, Response } from 'express';
import { requireUserId } from '../context/user-context';
import { getPushNotificationService } from '../services/push-notification.service';
import { getConfig } from '../config/env';

export const pushRouter = Router();

/**
 * GET /api/push/vapid-key
 * Returns the VAPID public key needed by the browser to subscribe.
 * Returns 404 if push is not configured.
 */
pushRouter.get('/vapid-key', (_req: Request, res: Response) => {
  const config = getConfig();
  if (!config.VAPID_PUBLIC_KEY) {
    return res.status(404).json({
      error: { code: 'NOT_CONFIGURED', message: 'Push notifications are not configured.' }
    });
  }
  res.json({ publicKey: config.VAPID_PUBLIC_KEY });
});

/**
 * POST /api/push/subscribe
 * Register a push subscription for the authenticated user.
 * Body: { endpoint, keys: { p256dh, auth } }
 */
pushRouter.post('/subscribe', async (req: Request, res: Response) => {
  const userId = requireUserId();
  const { endpoint, keys } = req.body as {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'endpoint, keys.p256dh, and keys.auth are required.'
      }
    });
  }

  const service = getPushNotificationService();
  if (!service.isEnabled()) {
    return res.status(404).json({
      error: { code: 'NOT_CONFIGURED', message: 'Push notifications are not configured.' }
    });
  }

  await service.subscribe(userId, { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } });
  res.status(201).json({ subscribed: true });
});

/**
 * POST /api/push/unsubscribe
 * Remove a push subscription for the authenticated user.
 * Body: { endpoint }
 */
pushRouter.post('/unsubscribe', async (req: Request, res: Response) => {
  const userId = requireUserId();
  const { endpoint } = req.body as { endpoint?: string };

  if (!endpoint) {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'endpoint is required.' }
    });
  }

  const service = getPushNotificationService();
  const removed = await service.unsubscribe(userId, endpoint);
  res.json({ removed });
});

/**
 * GET /api/push/status
 * Returns whether push is configured and the user's active subscription count.
 */
pushRouter.get('/status', async (_req: Request, res: Response) => {
  const userId = requireUserId();
  const service = getPushNotificationService();

  if (!service.isEnabled()) {
    return res.json({ enabled: false, subscriptionCount: 0 });
  }

  const subscriptions = await service.getSubscriptions(userId);
  res.json({ enabled: true, subscriptionCount: subscriptions.length });
});

/**
 * POST /api/push/test
 * Send a test push notification to the authenticated user.
 * Optional body: { title, body }
 */
pushRouter.post('/test', async (req: Request, res: Response) => {
  const userId = requireUserId();
  const service = getPushNotificationService();

  if (!service.isEnabled()) {
    return res.status(404).json({
      error: { code: 'NOT_CONFIGURED', message: 'Push notifications are not configured.' }
    });
  }

  const { title, body } = req.body as { title?: string; body?: string };

  const sent = await service.sendToUser(userId, {
    title: title || 'Test Notification',
    body: body || 'This is a test push notification from JustDo.so.',
    tag: 'test',
    url: '/'
  });

  res.json({ sent });
});

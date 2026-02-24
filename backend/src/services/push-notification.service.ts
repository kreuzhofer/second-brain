/**
 * Push Notification Service
 * Manages Web Push subscriptions and sends push notifications
 * for proactive nudges (stale checks, follow-ups, inactivity nudges).
 *
 * Push is inactive unless VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY are set.
 */

import webpush, { PushSubscription as WebPushSubscription } from 'web-push';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../lib/prisma';
import { getConfig } from '../config/env';

// ============================================
// Types
// ============================================

export interface PushPayload {
  title: string;
  body: string;
  tag: string; // prevents duplicate notifications (same tag replaces)
  url?: string; // URL to open on click
}

export interface SubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// ============================================
// Service Class
// ============================================

export class PushNotificationService {
  private prisma: PrismaClient;
  private initialized = false;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma || getPrismaClient();
  }

  /**
   * Check if push notifications are configured (VAPID keys present).
   */
  isEnabled(): boolean {
    const config = getConfig();
    return !!(config.VAPID_PUBLIC_KEY && config.VAPID_PRIVATE_KEY);
  }

  /**
   * Initialize web-push with VAPID details (idempotent).
   */
  private ensureInitialized(): void {
    if (this.initialized || !this.isEnabled()) return;
    const config = getConfig();
    webpush.setVapidDetails(
      config.VAPID_SUBJECT || `mailto:${config.DEFAULT_USER_EMAIL}`,
      config.VAPID_PUBLIC_KEY!,
      config.VAPID_PRIVATE_KEY!
    );
    this.initialized = true;
  }

  /**
   * Save a push subscription for a user.
   * Upserts to handle re-subscriptions from the same browser.
   */
  async subscribe(userId: string, subscription: SubscriptionInput): Promise<void> {
    await this.prisma.pushSubscription.upsert({
      where: {
        userId_endpoint: {
          userId,
          endpoint: subscription.endpoint
        }
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      },
      update: {
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth
      }
    });
  }

  /**
   * Remove a push subscription for a user.
   * Returns true if a subscription was deleted, false if not found.
   */
  async unsubscribe(userId: string, endpoint: string): Promise<boolean> {
    const result = await this.prisma.pushSubscription.deleteMany({
      where: { userId, endpoint }
    });
    return result.count > 0;
  }

  /**
   * Get all push subscriptions for a user.
   */
  async getSubscriptions(userId: string): Promise<Array<{ endpoint: string }>> {
    return this.prisma.pushSubscription.findMany({
      where: { userId },
      select: { endpoint: true }
    });
  }

  /**
   * Send a push notification to all subscriptions for a user.
   * Silently removes subscriptions that return 404/410 (expired/unsubscribed).
   * Returns the number of notifications successfully sent.
   */
  async sendToUser(userId: string, payload: PushPayload): Promise<number> {
    if (!this.isEnabled()) return 0;
    this.ensureInitialized();

    const subscriptions = await this.prisma.pushSubscription.findMany({
      where: { userId }
    });

    if (subscriptions.length === 0) return 0;

    let sent = 0;

    for (const sub of subscriptions) {
      const pushSub: WebPushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };

      try {
        await webpush.sendNotification(pushSub, JSON.stringify(payload));
        sent++;
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          // Subscription expired or unsubscribed — clean up
          await this.prisma.pushSubscription.deleteMany({
            where: { id: sub.id }
          });
          console.log(`Removed expired push subscription ${sub.id}`);
        } else {
          console.error(`Push notification failed for subscription ${sub.id}:`, error);
        }
      }
    }

    return sent;
  }

  /**
   * Build a PushPayload from proactive job content.
   * Extracts a short title and body from the markdown content.
   */
  static buildPayloadFromContent(
    jobName: string,
    markdownContent: string
  ): PushPayload {
    // Extract title from first bold+emoji line, e.g. "**🔍 Stale Project Check**"
    const titleMatch = markdownContent.match(/^\*\*(.+?)\*\*/);
    const rawTitle = titleMatch
      ? titleMatch[1].replace(/[^\w\s\-–—?']/g, '').trim()
      : 'Second Brain';

    // Extract body: take first meaningful non-empty, non-title line
    const lines = markdownContent.split('\n').filter((l) => l.trim() !== '');
    const bodyLine = lines.find(
      (l, i) => i > 0 && !l.startsWith('**') && l.trim().length > 0
    );
    const body = bodyLine
      ? bodyLine.replace(/^\*\*|\*\*$/g, '').replace(/^- /, '').trim()
      : 'You have a new nudge in your Second Brain.';

    // Truncate body to 120 chars for notification readability
    const truncatedBody =
      body.length > 120 ? body.slice(0, 117) + '...' : body;

    return {
      title: rawTitle,
      body: truncatedBody,
      tag: `proactive-${jobName}`,
      url: '/'
    };
  }
}

// ============================================
// Singleton
// ============================================

let instance: PushNotificationService | null = null;

export function getPushNotificationService(): PushNotificationService {
  if (!instance) {
    instance = new PushNotificationService();
  }
  return instance;
}

export function resetPushNotificationService(): void {
  instance = null;
}

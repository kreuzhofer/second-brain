/**
 * Webhook Service
 * Delivers event payloads to configured webhook URLs with signing and retries.
 */

import { createHmac, randomUUID } from 'crypto';

export interface WebhookEvent {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface WebhookConfig {
  urls: string[];
  secret?: string;
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_BASE_MS = 500;

export class WebhookService {
  private config: WebhookConfig;
  private fetchImpl: typeof fetch;

  constructor(config?: Partial<WebhookConfig>, fetchImpl?: typeof fetch) {
    const urls = config?.urls ?? parseWebhookUrls(process.env.WEBHOOK_URLS || '');
    this.config = {
      urls,
      secret: config?.secret ?? process.env.WEBHOOK_SECRET,
      timeoutMs: config?.timeoutMs ?? parseInt(process.env.WEBHOOK_TIMEOUT_MS || String(DEFAULT_TIMEOUT_MS), 10),
      maxRetries: config?.maxRetries ?? parseInt(process.env.WEBHOOK_MAX_RETRIES || String(DEFAULT_MAX_RETRIES), 10),
      retryBaseMs: config?.retryBaseMs ?? parseInt(process.env.WEBHOOK_RETRY_BASE_MS || String(DEFAULT_RETRY_BASE_MS), 10)
    };
    this.fetchImpl = fetchImpl ?? fetch;
  }

  hasWebhooks(): boolean {
    return this.config.urls.length > 0;
  }

  async deliver(event: WebhookEvent): Promise<void> {
    if (!this.hasWebhooks()) return;

    const payload = JSON.stringify(event);
    await Promise.all(
      this.config.urls.map((url) => this.sendWithRetry(url, payload, event.type))
    );
  }

  buildEvent(type: string, data: Record<string, unknown>): WebhookEvent {
    return {
      id: randomUUID(),
      type,
      timestamp: new Date().toISOString(),
      data
    };
  }

  private async sendWithRetry(url: string, payload: string, eventType: string): Promise<void> {
    let attempt = 0;
    while (attempt < this.config.maxRetries) {
      attempt += 1;
      const success = await this.sendOnce(url, payload, eventType);
      if (success) return;
      await this.sleep(this.config.retryBaseMs * attempt);
    }
  }

  private async sendOnce(url: string, payload: string, eventType: string): Promise<boolean> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-JustDo-Event': eventType
      };
      const signature = this.signPayload(payload);
      if (signature) {
        headers['X-JustDo-Signature'] = signature;
      }

      const response = await this.fetchImpl(url, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal
      });
      return response.ok;
    } catch (error) {
      console.warn('Webhook delivery failed:', error);
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private signPayload(payload: string): string | null {
    if (!this.config.secret) return null;
    const signature = createHmac('sha256', this.config.secret)
      .update(payload)
      .digest('hex');
    return `sha256=${signature}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

let webhookServiceInstance: WebhookService | null = null;

export function getWebhookService(): WebhookService {
  if (!webhookServiceInstance) {
    webhookServiceInstance = new WebhookService();
  }
  return webhookServiceInstance;
}

function parseWebhookUrls(value: string): string[] {
  return value
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);
}

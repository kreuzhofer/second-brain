/**
 * Offline Queue Service
 * Persists capture requests when LLM is unavailable and replays them later.
 */

import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { getConfig } from '../config/env';
import { Channel } from '../types/entry.types';
import { ContextWindow } from '../types/chat.types';
import { getPrismaClient } from '../lib/prisma';

export type OfflineQueueTool = 'classify_and_capture';

export interface OfflineQueueItem {
  id: string;
  tool: OfflineQueueTool;
  args: Record<string, unknown>;
  channel: Channel;
  context?: ContextWindow;
  createdAt: string;
  attempts: number;
  lastError?: string;
  nextAttemptAt?: string;
  processingStartedAt?: string;
}

export interface OfflineQueueStatus {
  pending: number;
  processing: number;
  failed: number;
}

export interface OfflineQueueProcessResult {
  success: boolean;
  error?: string;
}

export type OfflineQueueProcessor = (item: OfflineQueueItem) => Promise<OfflineQueueProcessResult>;

interface OfflineQueueConfig {
  enabled: boolean;
  replayIntervalSec: number;
  processingTimeoutSec: number;
  retryBaseSec: number;
  maxAttempts: number;
  dedupeTtlHours: number;
}

export class OfflineQueueService {
  private prisma = getPrismaClient();
  private config: OfflineQueueConfig;
  private intervalId: NodeJS.Timeout | null = null;

  constructor(configOverrides?: Partial<OfflineQueueConfig>) {
    const config = getConfig();
    this.config = {
      enabled: config.OFFLINE_QUEUE_ENABLED ?? true,
      replayIntervalSec: config.OFFLINE_QUEUE_REPLAY_INTERVAL_SEC ?? 60,
      processingTimeoutSec: config.OFFLINE_QUEUE_PROCESSING_TIMEOUT_SEC ?? 300,
      retryBaseSec: config.OFFLINE_QUEUE_RETRY_BASE_SEC ?? 30,
      maxAttempts: config.OFFLINE_QUEUE_MAX_ATTEMPTS ?? 6,
      dedupeTtlHours: config.OFFLINE_QUEUE_DEDUPE_TTL_HOURS ?? 24,
      ...configOverrides
    };
  }

  isEnabled(): boolean {
    return this.config.enabled;
  }

  async enqueueCapture(
    text: string,
    hints: string | undefined,
    channel: Channel,
    context?: ContextWindow
  ): Promise<OfflineQueueItem | null> {
    if (!this.config.enabled) return null;

    const id = this.computeHash(text, hints, channel);
    const existing = await this.findExistingItem(id);
    if (existing) {
      return existing;
    }

    const created = await this.prisma.offlineQueueItem.create({
      data: {
        id,
        tool: 'classify_and_capture',
        args: { text, hints },
        channel,
        context: context ? (context as unknown as Prisma.InputJsonValue) : undefined,
        createdAt: new Date(),
        attempts: 0,
        status: 'pending'
      }
    });

    return this.toQueueItem(created);
  }

  async getStatus(): Promise<OfflineQueueStatus> {
    const [pending, processing, failed] = await Promise.all([
      this.prisma.offlineQueueItem.count({ where: { status: 'pending' } }),
      this.prisma.offlineQueueItem.count({ where: { status: 'processing' } }),
      this.prisma.offlineQueueItem.count({ where: { status: 'failed' } })
    ]);
    return { pending, processing, failed };
  }

  async listFailed(): Promise<OfflineQueueItem[]> {
    const items = await this.prisma.offlineQueueItem.findMany({
      where: { status: 'failed' },
      orderBy: { createdAt: 'asc' }
    });
    return items.map((item) => this.toQueueItem(item));
  }

  startProcessing(processor: OfflineQueueProcessor): void {
    if (!this.config.enabled) return;
    if (process.env.NODE_ENV === 'test') return;
    if (this.intervalId) return;

    const intervalMs = this.config.replayIntervalSec * 1000;
    this.intervalId = setInterval(() => {
      void this.tick(processor);
    }, intervalMs);
    void this.tick(processor);
  }

  stopProcessing(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async tick(processor: OfflineQueueProcessor): Promise<void> {
    await this.requeueStuck();
    await this.processPending(processor);
    await this.pruneProcessed();
  }

  async processPending(processor: OfflineQueueProcessor): Promise<void> {
    const pending = await this.prisma.offlineQueueItem.findMany({
      where: {
        status: 'pending',
        OR: [
          { nextAttemptAt: null },
          { nextAttemptAt: { lte: new Date() } }
        ]
      },
      orderBy: { createdAt: 'asc' }
    });

    for (const record of pending) {
      const item = this.toQueueItem(record);
      const updated = await this.prisma.offlineQueueItem.update({
        where: { id: item.id },
        data: {
          status: 'processing',
          processingStartedAt: new Date()
        }
      });

      let result: OfflineQueueProcessResult;
      try {
        result = await processor(this.toQueueItem(updated));
      } catch (error) {
        result = { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
      }

      if (result.success) {
        await this.prisma.offlineQueueItem.update({
          where: { id: item.id },
          data: { status: 'processed' }
        });
        continue;
      }

      await this.handleFailure(item, result.error);
    }
  }

  private async handleFailure(item: OfflineQueueItem, error: string | undefined): Promise<void> {
    const attempts = item.attempts + 1;
    const nextDelaySec = this.config.retryBaseSec * Math.pow(2, Math.max(0, attempts - 1));
    const nextAttemptAt = new Date(Date.now() + nextDelaySec * 1000);

    if (attempts >= this.config.maxAttempts) {
      await this.prisma.offlineQueueItem.update({
        where: { id: item.id },
        data: {
          attempts,
          lastError: error ?? 'Unknown error',
          status: 'failed',
          processingStartedAt: null,
          nextAttemptAt: null
        }
      });
      return;
    }

    await this.prisma.offlineQueueItem.update({
      where: { id: item.id },
      data: {
        attempts,
        lastError: error ?? 'Unknown error',
        status: 'pending',
        processingStartedAt: null,
        nextAttemptAt
      }
    });
  }

  private async requeueStuck(): Promise<void> {
    const stuck = await this.prisma.offlineQueueItem.findMany({
      where: {
        status: 'processing',
        processingStartedAt: { not: null }
      }
    });

    for (const item of stuck) {
      const startedAt = item.processingStartedAt ? item.processingStartedAt.getTime() : 0;
      if (!startedAt) continue;
      const elapsed = (Date.now() - startedAt) / 1000;
      if (elapsed < this.config.processingTimeoutSec) {
        continue;
      }

      await this.prisma.offlineQueueItem.update({
        where: { id: item.id },
        data: {
          status: 'pending',
          processingStartedAt: null,
          nextAttemptAt: new Date(Date.now() + this.config.retryBaseSec * 1000)
        }
      });
    }
  }

  private async pruneProcessed(): Promise<void> {
    const cutoff = Date.now() - this.config.dedupeTtlHours * 60 * 60 * 1000;
    await this.prisma.offlineQueueItem.deleteMany({
      where: {
        status: 'processed',
        createdAt: { lt: new Date(cutoff) }
      }
    });
  }

  private async findExistingItem(id: string): Promise<OfflineQueueItem | null> {
    const cutoff = new Date(Date.now() - this.config.dedupeTtlHours * 60 * 60 * 1000);
    const existing = await this.prisma.offlineQueueItem.findFirst({
      where: {
        id,
        createdAt: { gte: cutoff },
        status: { in: ['pending', 'processing', 'failed'] }
      }
    });
    return existing ? this.toQueueItem(existing) : null;
  }

  private computeHash(text: string, hints: string | undefined, channel: Channel): string {
    const hash = createHash('sha256');
    hash.update(text);
    hash.update(hints || '');
    hash.update(channel);
    return hash.digest('hex');
  }

  private toQueueItem(record: any): OfflineQueueItem {
    return {
      id: record.id,
      tool: record.tool as OfflineQueueTool,
      args: record.args as Record<string, unknown>,
      channel: record.channel,
      context: record.context as ContextWindow | undefined,
      createdAt: record.createdAt.toISOString(),
      attempts: record.attempts,
      lastError: record.lastError ?? undefined,
      nextAttemptAt: record.nextAttemptAt ? record.nextAttemptAt.toISOString() : undefined,
      processingStartedAt: record.processingStartedAt ? record.processingStartedAt.toISOString() : undefined
    };
  }
}

let offlineQueueServiceInstance: OfflineQueueService | null = null;

export function getOfflineQueueService(): OfflineQueueService {
  if (!offlineQueueServiceInstance) {
    offlineQueueServiceInstance = new OfflineQueueService();
  }
  return offlineQueueServiceInstance;
}

export function resetOfflineQueueService(): void {
  offlineQueueServiceInstance = null;
}

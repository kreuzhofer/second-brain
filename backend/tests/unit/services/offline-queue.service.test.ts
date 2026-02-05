import { resetDatabase } from '../../setup';
import { OfflineQueueService } from '../../../src/services/offline-queue.service';

describe('OfflineQueueService', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it('dedupes identical capture requests', async () => {
    const queue = new OfflineQueueService({
      enabled: true,
      dedupeTtlHours: 24
    });

    const first = await queue.enqueueCapture('Test thought', undefined, 'api');
    const second = await queue.enqueueCapture('Test thought', undefined, 'api');

    expect(first?.id).toBeDefined();
    expect(second?.id).toBe(first?.id);

    const status = await queue.getStatus();
    expect(status.pending).toBe(1);
  });

  it('processes pending items and marks them processed', async () => {
    const queue = new OfflineQueueService({
      enabled: true,
      maxAttempts: 2,
      retryBaseSec: 1,
      dedupeTtlHours: 1
    });

    await queue.enqueueCapture('Process me', undefined, 'api');
    await queue.processPending(async () => ({ success: true }));

    const status = await queue.getStatus();
    expect(status.pending).toBe(0);
    expect(status.failed).toBe(0);
  });
});

import { WebhookService } from '../../../src/services/webhook.service';

describe('WebhookService', () => {
  it('should no-op when no webhook URLs are configured', async () => {
    const fetchMock = jest.fn();
    const service = new WebhookService({ urls: [] }, fetchMock as any);

    await service.deliver(service.buildEvent('entry.created', { path: 'projects/test.md' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('should include signature header when secret is provided', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true });
    const service = new WebhookService(
      { urls: ['https://example.com'], secret: 'secret', maxRetries: 1, retryBaseMs: 0, timeoutMs: 1000 },
      fetchMock as any
    );

    await service.deliver(service.buildEvent('entry.created', { path: 'projects/test.md' }));

    const call = fetchMock.mock.calls[0];
    const headers = call[1].headers as Record<string, string>;
    expect(headers['X-Second-Brain-Event']).toBe('entry.created');
    expect(headers['X-Second-Brain-Signature']).toMatch(/^sha256=/);
  });

  it('should retry failed webhook deliveries', async () => {
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({ ok: false })
      .mockResolvedValueOnce({ ok: true });

    const service = new WebhookService(
      { urls: ['https://example.com'], maxRetries: 2, retryBaseMs: 0, timeoutMs: 1000 },
      fetchMock as any
    );

    await service.deliver(service.buildEvent('entry.updated', { path: 'projects/test.md' }));

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

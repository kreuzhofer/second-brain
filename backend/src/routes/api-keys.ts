import { Router, Request, Response } from 'express';
import { getApiKeyService } from '../services/api-key.service';
import { requireUserId } from '../context/user-context';

export const apiKeysRouter = Router();

apiKeysRouter.post('/', async (req: Request, res: Response) => {
  const { agentName, permissions, expiresAt } = req.body as {
    agentName?: string;
    permissions?: string[];
    expiresAt?: string;
  };

  if (!agentName || typeof agentName !== 'string' || agentName.trim().length === 0) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'agentName is required.' },
    });
    return;
  }

  if (agentName.length > 100) {
    res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: 'agentName must be 100 characters or less.' },
    });
    return;
  }

  const userId = requireUserId();
  const service = getApiKeyService();

  try {
    const parsedExpiry = expiresAt ? new Date(expiresAt) : undefined;
    const result = await service.create(userId, agentName.trim(), permissions, parsedExpiry);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({
      error: {
        code: 'CREATE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to create API key.',
      },
    });
  }
});

apiKeysRouter.get('/', async (_req: Request, res: Response) => {
  const userId = requireUserId();
  const service = getApiKeyService();

  try {
    const keys = await service.list(userId);
    res.json({ keys });
  } catch (error) {
    res.status(400).json({
      error: {
        code: 'LIST_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list API keys.',
      },
    });
  }
});

apiKeysRouter.post('/:id/revoke', async (req: Request, res: Response) => {
  const userId = requireUserId();
  const service = getApiKeyService();

  try {
    await service.revoke(userId, req.params.id);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to revoke API key.';
    if (message === 'API key not found') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message },
      });
    } else {
      res.status(400).json({
        error: { code: 'REVOKE_FAILED', message },
      });
    }
  }
});

apiKeysRouter.delete('/:id', async (req: Request, res: Response) => {
  const userId = requireUserId();
  const service = getApiKeyService();

  try {
    await service.delete(userId, req.params.id);
    res.status(204).send();
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete API key.';
    if (message === 'API key not found') {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message },
      });
    } else {
      res.status(400).json({
        error: { code: 'DELETE_FAILED', message },
      });
    }
  }
});

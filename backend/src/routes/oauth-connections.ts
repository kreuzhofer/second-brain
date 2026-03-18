import { Router, Request, Response } from 'express';
import { requireUserId } from '../context/user-context';
import { getPrismaClient } from '../lib/prisma';

export const oauthConnectionsRouter = Router();

export interface OAuthConnectionInfo {
  clientId: string;
  clientName: string | null;
  createdAt: string;
  activeTokens: number;
}

oauthConnectionsRouter.get('/', async (_req: Request, res: Response) => {
  const userId = requireUserId();
  const prisma = getPrismaClient();

  try {
    const clients = await prisma.oAuthClient.findMany({
      where: {
        refreshTokens: {
          some: { userId },
        },
      },
      include: {
        _count: {
          select: {
            refreshTokens: {
              where: {
                userId,
                revokedAt: null,
                expiresAt: { gt: new Date() },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const connections: OAuthConnectionInfo[] = clients.map((c) => ({
      clientId: c.clientId,
      clientName: c.clientName,
      createdAt: c.createdAt.toISOString(),
      activeTokens: c._count.refreshTokens,
    }));

    res.json({ connections });
  } catch (error) {
    res.status(400).json({
      error: {
        code: 'LIST_FAILED',
        message: error instanceof Error ? error.message : 'Failed to list OAuth connections.',
      },
    });
  }
});

oauthConnectionsRouter.delete('/:clientId', async (req: Request, res: Response) => {
  const userId = requireUserId();
  const prisma = getPrismaClient();
  const { clientId } = req.params;

  try {
    // Revoke all refresh tokens for this user+client
    const result = await prisma.oAuthRefreshToken.updateMany({
      where: {
        clientId,
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });

    if (result.count === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'No active connection found for this client.' },
      });
      return;
    }

    res.status(204).send();
  } catch (error) {
    res.status(400).json({
      error: {
        code: 'REVOKE_FAILED',
        message: error instanceof Error ? error.message : 'Failed to revoke connection.',
      },
    });
  }
});

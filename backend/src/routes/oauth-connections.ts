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
    // Only show clients that have at least one active (non-revoked, non-expired) token
    const clients = await prisma.oAuthClient.findMany({
      where: {
        refreshTokens: {
          some: {
            userId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
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
    // Verify this client has tokens belonging to this user
    const tokenCount = await prisma.oAuthRefreshToken.count({
      where: { clientId, userId },
    });

    if (tokenCount === 0) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'No connection found for this client.' },
      });
      return;
    }

    // Delete all tokens, auth codes, and the client itself
    await prisma.oAuthRefreshToken.deleteMany({ where: { clientId } });
    await prisma.oAuthAuthorizationCode.deleteMany({ where: { clientId } });
    await prisma.oAuthClient.delete({ where: { clientId } });

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

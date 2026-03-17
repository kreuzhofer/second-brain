import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { getPrismaClient } from '../lib/prisma';

export interface CreateApiKeyResult {
  key: string;
  id: string;
  keyPrefix: string;
  agentName: string;
}

export interface ApiKeyInfo {
  id: string;
  keyPrefix: string;
  agentName: string;
  permissions: string[];
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}

export class ApiKeyService {
  private prisma = getPrismaClient();

  async create(
    userId: string,
    agentName: string,
    permissions?: string[],
    expiresAt?: Date
  ): Promise<CreateApiKeyResult> {
    const key = crypto.randomBytes(32).toString('hex');
    const keyHash = await bcrypt.hash(key, 10);
    const keyPrefix = key.slice(0, 8);

    const record = await this.prisma.agentApiKey.create({
      data: {
        userId,
        keyHash,
        keyPrefix,
        agentName,
        permissions: permissions ?? [],
        expiresAt: expiresAt ?? null,
      },
    });

    return { key, id: record.id, keyPrefix, agentName };
  }

  async list(userId: string): Promise<ApiKeyInfo[]> {
    const keys = await this.prisma.agentApiKey.findMany({
      where: { userId },
      select: {
        id: true,
        keyPrefix: true,
        agentName: true,
        permissions: true,
        lastUsedAt: true,
        expiresAt: true,
        revokedAt: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return keys;
  }

  async revoke(userId: string, keyId: string): Promise<void> {
    const key = await this.prisma.agentApiKey.findFirst({
      where: { id: keyId, userId },
    });

    if (!key) {
      throw new Error('API key not found');
    }

    await this.prisma.agentApiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
  }

  async verify(key: string): Promise<{ userId: string; agentId: string; agentName: string } | null> {
    const prefix = key.slice(0, 8);
    const candidates = await this.prisma.agentApiKey.findMany({
      where: { keyPrefix: prefix, revokedAt: null },
      select: { id: true, userId: true, keyHash: true, agentName: true, expiresAt: true }
    });

    for (const candidate of candidates) {
      if (candidate.expiresAt && candidate.expiresAt < new Date()) continue;
      const matches = await bcrypt.compare(key, candidate.keyHash);
      if (matches) {
        // Update lastUsedAt in the background
        this.prisma.agentApiKey.update({
          where: { id: candidate.id },
          data: { lastUsedAt: new Date() }
        }).catch(() => {});
        return { userId: candidate.userId, agentId: candidate.id, agentName: candidate.agentName };
      }
    }
    return null;
  }

  async delete(userId: string, keyId: string): Promise<void> {
    const key = await this.prisma.agentApiKey.findFirst({
      where: { id: keyId, userId },
    });

    if (!key) {
      throw new Error('API key not found');
    }

    await this.prisma.agentApiKey.delete({
      where: { id: keyId },
    });
  }
}

let apiKeyServiceInstance: ApiKeyService | null = null;

export function getApiKeyService(): ApiKeyService {
  if (!apiKeyServiceInstance) {
    apiKeyServiceInstance = new ApiKeyService();
  }
  return apiKeyServiceInstance;
}

export function resetApiKeyService(): void {
  apiKeyServiceInstance = null;
}

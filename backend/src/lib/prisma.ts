import { PrismaClient } from '@prisma/client';

// Singleton Prisma client instance
let prisma: PrismaClient | null = null;

/**
 * Get the Prisma client singleton instance
 * Creates a new instance if one doesn't exist
 */
export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error']
        : ['error']
    });
  }
  return prisma;
}

/**
 * Disconnect the Prisma client
 * Should be called when shutting down the application
 */
export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

/**
 * Connect to the database
 * Useful for health checks and startup validation
 */
export async function connectPrisma(): Promise<void> {
  const client = getPrismaClient();
  await client.$connect();
}

// Export the default client for convenience
export const db = getPrismaClient();

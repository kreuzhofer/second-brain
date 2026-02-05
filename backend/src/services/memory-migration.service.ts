import { getPrismaClient } from '../lib/prisma';
import {
  getMemoryPath,
  hasAnyMemoryFiles,
  importEmbeddingsFromCache,
  importMemoryEntries
} from '../utils/memory-migration';

interface MemoryMigrationConfig {
  enabled: boolean;
  force: boolean;
}

export class MemoryMigrationService {
  private prisma = getPrismaClient();
  private running = false;
  private config: MemoryMigrationConfig;

  constructor() {
    this.config = {
      enabled: process.env.MEMORY_MIGRATION_ENABLED !== 'false',
      force: process.env.MEMORY_MIGRATION_FORCE === 'true'
    };
  }

  start(): void {
    if (process.env.NODE_ENV === 'test') return;
    void this.runIfNeeded();
  }

  async runIfNeeded(): Promise<void> {
    if (this.running) return;
    if (!this.config.enabled) {
      console.log('Memory migration: disabled');
      return;
    }

    const memoryPath = getMemoryPath();
    const hasFiles = await hasAnyMemoryFiles(memoryPath);
    if (!hasFiles) {
      console.log('Memory migration: no markdown files found');
      return;
    }

    const entryCount = await this.prisma.entry.count();
    if (entryCount > 0 && !this.config.force) {
      console.log('Memory migration: skipped (entries already exist)');
      return;
    }

    this.running = true;
    try {
      console.log('Memory migration: starting');
      const entryResult = await importMemoryEntries(this.prisma, memoryPath);
      const embeddingResult = await importEmbeddingsFromCache(this.prisma, memoryPath);

      console.log(`Memory migration: imported entries=${entryResult.imported}, skipped=${entryResult.skipped}`);
      if (embeddingResult.imported || embeddingResult.skipped) {
        console.log(
          `Memory migration: imported embeddings=${embeddingResult.imported}, skipped=${embeddingResult.skipped}`
        );
      }
    } catch (error) {
      console.error('Memory migration failed:', error);
    } finally {
      this.running = false;
    }
  }
}

let memoryMigrationInstance: MemoryMigrationService | null = null;

export function getMemoryMigrationService(): MemoryMigrationService {
  if (!memoryMigrationInstance) {
    memoryMigrationInstance = new MemoryMigrationService();
  }
  return memoryMigrationInstance;
}

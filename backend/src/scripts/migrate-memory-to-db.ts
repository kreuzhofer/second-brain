import { getPrismaClient } from '../lib/prisma';
import { getMemoryPath, importMemoryEntries, importEmbeddingsFromCache } from '../utils/memory-migration';

async function main(): Promise<void> {
  const prisma = getPrismaClient();
  const memoryPath = getMemoryPath();

  const entryResult = await importMemoryEntries(prisma, memoryPath);
  const embeddingResult = await importEmbeddingsFromCache(prisma, memoryPath);

  console.log(`Imported entries: ${entryResult.imported}`);
  console.log(`Skipped existing entries: ${entryResult.skipped}`);
  if (embeddingResult.imported || embeddingResult.skipped) {
    console.log(`Imported embeddings: ${embeddingResult.imported}`);
    console.log(`Skipped embeddings: ${embeddingResult.skipped}`);
  }
}

main()
  .catch((error) => {
    console.error('Migration failed', error);
    process.exit(1);
  })
  .finally(async () => {
    const prisma = getPrismaClient();
    await prisma.$disconnect();
  });

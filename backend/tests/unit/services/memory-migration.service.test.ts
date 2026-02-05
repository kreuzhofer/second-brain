import { getPrismaClient } from '../../../src/lib/prisma';
import {
  getMemoryPath,
  hasAnyMemoryFiles,
  importEmbeddingsFromCache,
  importMemoryEntries
} from '../../../src/utils/memory-migration';
import { MemoryMigrationService } from '../../../src/services/memory-migration.service';

jest.mock('../../../src/lib/prisma');
jest.mock('../../../src/utils/memory-migration');

const mockPrisma = {
  entry: {
    count: jest.fn()
  }
};

const mockedGetPrismaClient = getPrismaClient as jest.MockedFunction<typeof getPrismaClient>;
const mockedGetMemoryPath = getMemoryPath as jest.MockedFunction<typeof getMemoryPath>;
const mockedHasAnyMemoryFiles = hasAnyMemoryFiles as jest.MockedFunction<typeof hasAnyMemoryFiles>;
const mockedImportMemoryEntries = importMemoryEntries as jest.MockedFunction<typeof importMemoryEntries>;
const mockedImportEmbeddingsFromCache = importEmbeddingsFromCache as jest.MockedFunction<typeof importEmbeddingsFromCache>;

describe('MemoryMigrationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.MEMORY_MIGRATION_ENABLED;
    delete process.env.MEMORY_MIGRATION_FORCE;
    mockedGetPrismaClient.mockReturnValue(mockPrisma as any);
    mockedGetMemoryPath.mockReturnValue('/memory');
    mockedHasAnyMemoryFiles.mockResolvedValue(true);
    mockedImportMemoryEntries.mockResolvedValue({ imported: 1, skipped: 0 });
    mockedImportEmbeddingsFromCache.mockResolvedValue({ imported: 0, skipped: 0 });
  });

  it('skips when disabled', async () => {
    process.env.MEMORY_MIGRATION_ENABLED = 'false';
    mockPrisma.entry.count.mockResolvedValue(0);

    const service = new MemoryMigrationService();
    await service.runIfNeeded();

    expect(mockedImportMemoryEntries).not.toHaveBeenCalled();
  });

  it('skips when entries already exist', async () => {
    mockPrisma.entry.count.mockResolvedValue(2);

    const service = new MemoryMigrationService();
    await service.runIfNeeded();

    expect(mockedImportMemoryEntries).not.toHaveBeenCalled();
  });

  it('runs when db empty and memory files exist', async () => {
    mockPrisma.entry.count.mockResolvedValue(0);

    const service = new MemoryMigrationService();
    await service.runIfNeeded();

    expect(mockedImportMemoryEntries).toHaveBeenCalledWith(mockPrisma, '/memory');
    expect(mockedImportEmbeddingsFromCache).toHaveBeenCalledWith(mockPrisma, '/memory');
  });

  it('forces migration when flag enabled', async () => {
    process.env.MEMORY_MIGRATION_FORCE = 'true';
    mockPrisma.entry.count.mockResolvedValue(5);

    const service = new MemoryMigrationService();
    await service.runIfNeeded();

    expect(mockedImportMemoryEntries).toHaveBeenCalled();
  });
});

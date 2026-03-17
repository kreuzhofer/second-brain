-- CreateEnum
CREATE TYPE "MemoryType" AS ENUM ('fact', 'preference', 'context', 'feedback', 'relationship');

-- AlterEnum
ALTER TYPE "EntryCategory" ADD VALUE 'memory';

-- CreateTable
CREATE TABLE "MemoryDetails" (
    "entryId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "memoryType" "MemoryType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "expiresAt" TIMESTAMP(3),
    "sourceConversationId" TEXT,

    CONSTRAINT "MemoryDetails_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "AgentApiKey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "permissions" TEXT[],
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentApiKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MemoryDetails_agentId_idx" ON "MemoryDetails"("agentId");

-- CreateIndex
CREATE INDEX "AgentApiKey_userId_idx" ON "AgentApiKey"("userId");

-- CreateIndex
CREATE INDEX "AgentApiKey_keyPrefix_idx" ON "AgentApiKey"("keyPrefix");

-- AddForeignKey
ALTER TABLE "MemoryDetails" ADD CONSTRAINT "MemoryDetails_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentApiKey" ADD CONSTRAINT "AgentApiKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

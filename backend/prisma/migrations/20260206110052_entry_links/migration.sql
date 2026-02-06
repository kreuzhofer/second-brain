-- CreateEnum
CREATE TYPE "EntryLinkType" AS ENUM ('mention');

-- CreateTable
CREATE TABLE "EntryLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sourceEntryId" TEXT NOT NULL,
    "targetEntryId" TEXT NOT NULL,
    "type" "EntryLinkType" NOT NULL DEFAULT 'mention',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EntryLink_userId_sourceEntryId_idx" ON "EntryLink"("userId", "sourceEntryId");

-- CreateIndex
CREATE INDEX "EntryLink_userId_targetEntryId_idx" ON "EntryLink"("userId", "targetEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "EntryLink_sourceEntryId_targetEntryId_type_key" ON "EntryLink"("sourceEntryId", "targetEntryId", "type");

-- AddForeignKey
ALTER TABLE "EntryLink" ADD CONSTRAINT "EntryLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryLink" ADD CONSTRAINT "EntryLink_sourceEntryId_fkey" FOREIGN KEY ("sourceEntryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryLink" ADD CONSTRAINT "EntryLink_targetEntryId_fkey" FOREIGN KEY ("targetEntryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

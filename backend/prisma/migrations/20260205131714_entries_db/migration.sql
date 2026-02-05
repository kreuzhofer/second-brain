-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "EntryCategory" AS ENUM ('people', 'projects', 'ideas', 'admin', 'inbox');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('active', 'waiting', 'blocked', 'someday', 'done');

-- CreateEnum
CREATE TYPE "AdminStatus" AS ENUM ('pending', 'done');

-- CreateEnum
CREATE TYPE "InboxStatus" AS ENUM ('needs_review');

-- AlterTable
ALTER TABLE "EntryAuditLog" ADD COLUMN     "entryId" TEXT;

-- AlterTable
ALTER TABLE "FocusSession" ADD COLUMN     "entryId" TEXT;

-- CreateTable
CREATE TABLE "Entry" (
    "id" TEXT NOT NULL,
    "category" "EntryCategory" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION,
    "sourceChannel" "Channel",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastTouched" TIMESTAMP(3),
    "focusMinutesTotal" INTEGER NOT NULL DEFAULT 0,
    "focusLastSession" TIMESTAMP(3),

    CONSTRAINT "Entry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectDetails" (
    "entryId" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL,
    "nextAction" TEXT,
    "relatedPeople" TEXT[],
    "dueDate" TIMESTAMP(3),
    "stale" BOOLEAN NOT NULL DEFAULT false,
    "staleSince" TIMESTAMP(3),

    CONSTRAINT "ProjectDetails_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "AdminTaskDetails" (
    "entryId" TEXT NOT NULL,
    "status" "AdminStatus" NOT NULL,
    "dueDate" TIMESTAMP(3),

    CONSTRAINT "AdminTaskDetails_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "IdeaDetails" (
    "entryId" TEXT NOT NULL,
    "oneLiner" TEXT NOT NULL,
    "relatedProjects" TEXT[],

    CONSTRAINT "IdeaDetails_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "PersonDetails" (
    "entryId" TEXT NOT NULL,
    "context" TEXT NOT NULL,
    "followUps" TEXT[],
    "relatedProjects" TEXT[],
    "lastTouched" TIMESTAMP(3),

    CONSTRAINT "PersonDetails_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "InboxDetails" (
    "entryId" TEXT NOT NULL,
    "originalText" TEXT NOT NULL,
    "suggestedCategory" "EntryCategory" NOT NULL,
    "suggestedName" TEXT NOT NULL,
    "status" "InboxStatus" NOT NULL DEFAULT 'needs_review',

    CONSTRAINT "InboxDetails_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "EntrySection" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "contentMarkdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntrySection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryLog" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryTag" (
    "entryId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "EntryTag_pkey" PRIMARY KEY ("entryId","tagId")
);

-- CreateTable
CREATE TABLE "EntryRevision" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "channel" "Channel",
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryRevision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryEmbedding" (
    "entryId" TEXT NOT NULL,
    "vector" vector(3072) NOT NULL,
    "hash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntryEmbedding_pkey" PRIMARY KEY ("entryId")
);

-- CreateTable
CREATE TABLE "DigestPreference" (
    "id" TEXT NOT NULL,
    "focusCategories" "EntryCategory"[],
    "maxItems" INTEGER NOT NULL,
    "maxOpenLoops" INTEGER NOT NULL,
    "maxSuggestions" INTEGER NOT NULL,
    "maxWords" INTEGER,
    "includeStaleInbox" BOOLEAN NOT NULL DEFAULT true,
    "includeSmallWins" BOOLEAN NOT NULL DEFAULT true,
    "includeOpenLoops" BOOLEAN NOT NULL DEFAULT true,
    "includeSuggestions" BOOLEAN NOT NULL DEFAULT true,
    "includeTheme" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigestPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyTipState" (
    "id" TEXT NOT NULL,
    "order" INTEGER[],
    "cursor" INTEGER NOT NULL,
    "lastTip" TEXT,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "DailyTipState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OfflineQueueItem" (
    "id" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "args" JSONB NOT NULL,
    "channel" "Channel" NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3),
    "processingStartedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'pending',

    CONSTRAINT "OfflineQueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Entry_category_idx" ON "Entry"("category");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_category_slug_key" ON "Entry"("category", "slug");

-- CreateIndex
CREATE INDEX "EntrySection_entryId_order_idx" ON "EntrySection"("entryId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "EntrySection_entryId_key_key" ON "EntrySection"("entryId", "key");

-- CreateIndex
CREATE INDEX "EntryLog_entryId_createdAt_idx" ON "EntryLog"("entryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "EntryRevision_entryId_createdAt_idx" ON "EntryRevision"("entryId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EntryRevision_entryId_revision_key" ON "EntryRevision"("entryId", "revision");

-- CreateIndex
CREATE INDEX "OfflineQueueItem_status_createdAt_idx" ON "OfflineQueueItem"("status", "createdAt");

-- CreateIndex
CREATE INDEX "EntryAuditLog_entryId_createdAt_idx" ON "EntryAuditLog"("entryId", "createdAt");

-- CreateIndex
CREATE INDEX "FocusSession_entryId_startedAt_idx" ON "FocusSession"("entryId", "startedAt");

-- AddForeignKey
ALTER TABLE "EntryAuditLog" ADD CONSTRAINT "EntryAuditLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDetails" ADD CONSTRAINT "ProjectDetails_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdminTaskDetails" ADD CONSTRAINT "AdminTaskDetails_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdeaDetails" ADD CONSTRAINT "IdeaDetails_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonDetails" ADD CONSTRAINT "PersonDetails_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InboxDetails" ADD CONSTRAINT "InboxDetails_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntrySection" ADD CONSTRAINT "EntrySection_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryLog" ADD CONSTRAINT "EntryLog_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryTag" ADD CONSTRAINT "EntryTag_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryTag" ADD CONSTRAINT "EntryTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryRevision" ADD CONSTRAINT "EntryRevision_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryEmbedding" ADD CONSTRAINT "EntryEmbedding_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

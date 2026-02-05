/*
  Warnings:

  - A unique constraint covering the columns `[userId]` on the table `DailyTipState` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId]` on the table `DigestPreference` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,category,slug]` on the table `Entry` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,youtubeId]` on the table `FocusTrack` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[userId,name]` on the table `Tag` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Conversation_channel_externalId_idx";

-- DropIndex
DROP INDEX "EmailThread_conversationId_idx";

-- DropIndex
DROP INDEX "EmailThread_threadId_idx";

-- DropIndex
DROP INDEX "Entry_category_idx";

-- DropIndex
DROP INDEX "Entry_category_slug_key";

-- DropIndex
DROP INDEX "EntryAuditLog_entryPath_createdAt_idx";

-- DropIndex
DROP INDEX "FocusTrack_youtubeId_key";

-- DropIndex
DROP INDEX "OfflineQueueItem_status_createdAt_idx";

-- DropIndex
DROP INDEX "Tag_name_key";

-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "ConversationSummary" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "DailyTipState" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "DigestPreference" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "EmailThread" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Entry" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "EntryAuditLog" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "FocusSession" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "FocusTrack" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "OfflineQueueItem" ADD COLUMN     "userId" TEXT;

-- AlterTable
ALTER TABLE "Tag" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Conversation_userId_channel_externalId_idx" ON "Conversation"("userId", "channel", "externalId");

-- CreateIndex
CREATE INDEX "ConversationSummary_userId_createdAt_idx" ON "ConversationSummary"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DailyTipState_userId_key" ON "DailyTipState"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DigestPreference_userId_key" ON "DigestPreference"("userId");

-- CreateIndex
CREATE INDEX "EmailThread_userId_threadId_idx" ON "EmailThread"("userId", "threadId");

-- CreateIndex
CREATE INDEX "EmailThread_userId_conversationId_idx" ON "EmailThread"("userId", "conversationId");

-- CreateIndex
CREATE INDEX "Entry_userId_category_idx" ON "Entry"("userId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "Entry_userId_category_slug_key" ON "Entry"("userId", "category", "slug");

-- CreateIndex
CREATE INDEX "EntryAuditLog_userId_entryPath_createdAt_idx" ON "EntryAuditLog"("userId", "entryPath", "createdAt");

-- CreateIndex
CREATE INDEX "FocusSession_userId_startedAt_idx" ON "FocusSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX "FocusTrack_userId_rating_idx" ON "FocusTrack"("userId", "rating");

-- CreateIndex
CREATE UNIQUE INDEX "FocusTrack_userId_youtubeId_key" ON "FocusTrack"("userId", "youtubeId");

-- CreateIndex
CREATE INDEX "Message_userId_createdAt_idx" ON "Message"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "OfflineQueueItem_userId_status_createdAt_idx" ON "OfflineQueueItem"("userId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_userId_name_key" ON "Tag"("userId", "name");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSummary" ADD CONSTRAINT "ConversationSummary_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailThread" ADD CONSTRAINT "EmailThread_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EntryAuditLog" ADD CONSTRAINT "EntryAuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusTrack" ADD CONSTRAINT "FocusTrack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Entry" ADD CONSTRAINT "Entry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigestPreference" ADD CONSTRAINT "DigestPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyTipState" ADD CONSTRAINT "DailyTipState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OfflineQueueItem" ADD CONSTRAINT "OfflineQueueItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

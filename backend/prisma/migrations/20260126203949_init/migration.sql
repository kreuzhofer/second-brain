-- CreateEnum
CREATE TYPE "Channel" AS ENUM ('chat', 'email', 'api');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('running', 'success', 'failed');

-- CreateEnum
CREATE TYPE "Operation" AS ENUM ('create', 'update', 'delete', 'move');

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "channel" "Channel" NOT NULL,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "content" TEXT NOT NULL,
    "filedEntryPath" TEXT,
    "filedConfidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationSummary" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "messageCount" INTEGER NOT NULL,
    "startMessageId" TEXT NOT NULL,
    "endMessageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailThread" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "inReplyTo" TEXT,
    "subject" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CronJobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "result" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CronJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EntryAuditLog" (
    "id" TEXT NOT NULL,
    "entryPath" TEXT NOT NULL,
    "operation" "Operation" NOT NULL,
    "gitCommitHash" TEXT,
    "channel" "Channel" NOT NULL,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EntryAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_channel_externalId_idx" ON "Conversation"("channel", "externalId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "ConversationSummary_conversationId_createdAt_idx" ON "ConversationSummary"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailThread_messageId_key" ON "EmailThread"("messageId");

-- CreateIndex
CREATE INDEX "EmailThread_threadId_idx" ON "EmailThread"("threadId");

-- CreateIndex
CREATE INDEX "EmailThread_conversationId_idx" ON "EmailThread"("conversationId");

-- CreateIndex
CREATE INDEX "CronJobRun_jobName_startedAt_idx" ON "CronJobRun"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "EntryAuditLog_entryPath_createdAt_idx" ON "EntryAuditLog"("entryPath", "createdAt");

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationSummary" ADD CONSTRAINT "ConversationSummary_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

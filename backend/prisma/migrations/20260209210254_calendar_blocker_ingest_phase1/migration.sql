-- CreateTable
CREATE TABLE "CalendarSource" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "color" TEXT,
    "etag" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "fetchStatus" TEXT NOT NULL DEFAULT 'never_synced',
    "fetchError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalendarBusyBlock" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "sourceId" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "externalId" TEXT,
    "title" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarBusyBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarSource_userId_enabled_idx" ON "CalendarSource"("userId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarSource_userId_url_key" ON "CalendarSource"("userId", "url");

-- CreateIndex
CREATE INDEX "CalendarBusyBlock_userId_startAt_endAt_idx" ON "CalendarBusyBlock"("userId", "startAt", "endAt");

-- CreateIndex
CREATE INDEX "CalendarBusyBlock_sourceId_startAt_idx" ON "CalendarBusyBlock"("sourceId", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarBusyBlock_sourceId_blockKey_key" ON "CalendarBusyBlock"("sourceId", "blockKey");

-- AddForeignKey
ALTER TABLE "CalendarSource" ADD CONSTRAINT "CalendarSource_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBusyBlock" ADD CONSTRAINT "CalendarBusyBlock_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CalendarBusyBlock" ADD CONSTRAINT "CalendarBusyBlock_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "CalendarSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

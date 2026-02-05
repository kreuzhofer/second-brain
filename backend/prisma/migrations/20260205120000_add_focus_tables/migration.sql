-- CreateTable
CREATE TABLE "FocusTrack" (
    "id" TEXT NOT NULL,
    "youtubeId" TEXT NOT NULL,
    "title" TEXT,
    "channelTitle" TEXT,
    "searchTerm" TEXT,
    "rating" INTEGER NOT NULL DEFAULT 0,
    "timesPlayed" INTEGER NOT NULL DEFAULT 0,
    "lastPlayedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FocusTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FocusSession" (
    "id" TEXT NOT NULL,
    "entryPath" TEXT NOT NULL,
    "entryName" TEXT,
    "durationSeconds" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3) NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "trackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FocusSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FocusTrack_youtubeId_key" ON "FocusTrack"("youtubeId");

-- CreateIndex
CREATE INDEX "FocusSession_entryPath_startedAt_idx" ON "FocusSession"("entryPath", "startedAt");

-- CreateIndex
CREATE INDEX "FocusSession_trackId_idx" ON "FocusSession"("trackId");

-- AddForeignKey
ALTER TABLE "FocusSession" ADD CONSTRAINT "FocusSession_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "FocusTrack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

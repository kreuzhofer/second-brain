-- Add smart nudge preferences
ALTER TABLE "DigestPreference" ADD COLUMN     "includeNudges" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "DigestPreference" ADD COLUMN     "maxNudgesPerDay" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "DigestPreference" ADD COLUMN     "nudgeCooldownDays" INTEGER NOT NULL DEFAULT 3;

-- Track when entries were last nudged
CREATE TABLE "EntryNudge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "entryId" TEXT NOT NULL,
    "lastNudgedAt" TIMESTAMP(3) NOT NULL,
    "lastReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EntryNudge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EntryNudge_userId_entryId_key" ON "EntryNudge"("userId", "entryId");
CREATE INDEX "EntryNudge_userId_lastNudgedAt_idx" ON "EntryNudge"("userId", "lastNudgedAt");

ALTER TABLE "EntryNudge" ADD CONSTRAINT "EntryNudge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EntryNudge" ADD CONSTRAINT "EntryNudge_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "Entry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "AdminTaskDetails" ADD COLUMN     "durationMinutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "fixedAt" TIMESTAMP(3);

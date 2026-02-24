-- AlterTable
ALTER TABLE "User" ADD COLUMN "digestEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "digestEmailEnabled" BOOLEAN NOT NULL DEFAULT false;
